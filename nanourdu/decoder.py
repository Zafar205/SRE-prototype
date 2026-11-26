"""Trainable counterpart of the shipped width-62 sanoTTS int8 decoder."""
import argparse
import json
from pathlib import Path
import random
import re
import sys
import time

import numpy as np
import soundfile as sf
import torch
from torch import nn
from torch.nn import functional as F

ROOT = Path(__file__).resolve().parent
MCU = ROOT / "vendor/sanoTTS/mcu"
HOP = 256
CONFIG = {"n_mels": 100, "width": 62, "num_layers": 4, "expand": 3,
          "n_fft": 1024, "noise_channels": 4}


def fake_quant(weight):
    """Per-output-channel symmetric int8 round trip with a straight-through gradient."""
    scale = weight.abs().amax(dim=tuple(range(1, weight.dim())), keepdim=True).clamp_min(1e-8) / 127
    return weight + ((weight / scale).round().clamp(-127, 127) * scale - weight).detach()


def conv(layer, x, qat):
    return F.conv1d(x, fake_quant(layer.weight) if qat else layer.weight, layer.bias,
                    padding=layer.padding, groups=layer.groups)


def linear(layer, x, qat):
    return F.linear(x, fake_quant(layer.weight) if qat else layer.weight, layer.bias)


class ConvNeXtBlock(nn.Module):
    def __init__(self, width, expand):
        super().__init__()
        self.dwconv = nn.Conv1d(width, width, 7, padding=3, groups=width)
        self.norm = nn.LayerNorm(width, eps=1e-6)
        self.pwconv1 = nn.Linear(width, width * expand)
        self.pwconv2 = nn.Linear(width * expand, width)
        self.gamma = nn.Parameter(torch.ones(width))

    def forward(self, x, qat=False):
        features = self.norm(self.dwconv(x).transpose(1, 2))
        features = linear(self.pwconv2, F.gelu(linear(self.pwconv1, features, qat)), qat)
        return x + (features * self.gamma).transpose(1, 2)


class TinyVocosStudent(nn.Module):
    def __init__(self, *, n_mels, dim, num_layers, expand, n_fft, noise_channels):
        super().__init__()
        self.n_fft = n_fft
        self.embed = nn.Conv1d(n_mels, dim, 7, padding=3)
        self.noise_adapter = nn.Conv1d(noise_channels, dim, 7, padding=3)
        self.norm = nn.LayerNorm(dim, eps=1e-6)
        self.blocks = nn.ModuleList(ConvNeXtBlock(dim, expand) for _ in range(num_layers))
        self.final_norm = nn.LayerNorm(dim, eps=1e-6)
        self.head = nn.Linear(dim, n_fft + 2)

    def forward(self, mel, *, noise, qat=False):
        x = conv(self.embed, mel, qat) + conv(self.noise_adapter, noise, qat)
        x = self.norm(x.transpose(1, 2)).transpose(1, 2)
        for block in self.blocks:
            x = block(x, qat)
        x = self.final_norm(x.transpose(1, 2))
        log_magnitude, phase = linear(self.head, x, qat).transpose(1, 2).chunk(2, dim=1)
        middle = log_magnitude[:, 1:-1].clamp(max=4.605170186).exp()
        magnitude = F.pad(middle, (0, 0, 1, 1))
        return torch.polar(magnitude, phase)

    def synthesize(self, spectrum, window):
        return torch.istft(spectrum, self.n_fft, HOP, window=window)


def load_shipped_decoder():
    config = dict(CONFIG)
    config["dim"] = config.pop("width")
    model = TinyVocosStudent(**config)
    header = (MCU / "models/en_us_e13b/nano_q8_meta.h").read_text()
    constants = {k: int(v) for k, v in re.findall(r"^#define (\w+) (\d+)$", header, re.M)}
    blob = (MCU / "test/fixtures/en_us_e13b/model_q8.bin").read_bytes()
    if len(blob) != constants["NANO_DEC_BYTES"] or sum(p.numel() for p in model.parameters()) != 206_122:
        raise ValueError("Unexpected heart-nano decoder shape")

    def read(name, count, dtype="<f4"):
        return np.frombuffer(blob, dtype=dtype, count=count, offset=constants[f"DOFF_{name}"])

    def copy(target, array):
        target.copy_(torch.from_numpy(np.array(array, dtype=np.float32)).reshape(target.shape))

    def dense(layer, name):
        out, flat = layer.weight.shape[0], layer.weight[0].numel()
        width = (flat + 15) // 16 * 16
        values = read(f"{name}_W8", out * width, "i1").reshape(out, width)[:, :flat]
        copy(layer.weight, values * read(f"{name}_SCALE", out)[:, None])
        copy(layer.bias, read(f"{name}_BIAS", out))

    def norm(layer, name):
        copy(layer.weight, read(f"{name}_W_F32", layer.weight.numel()))
        copy(layer.bias, read(f"{name}_B_F32", layer.bias.numel()))

    with torch.no_grad():
        dense(model.embed, "EMBED")
        dense(model.noise_adapter, "NOISE")
        norm(model.norm, "NORM")
        for index, block in enumerate(model.blocks):
            prefix = f"B{index}"
            copy(block.dwconv.weight, read(f"{prefix}_DW_W_F32", block.dwconv.weight.numel()))
            copy(block.dwconv.bias, read(f"{prefix}_DW_B_F32", block.dwconv.bias.numel()))
            norm(block.norm, f"{prefix}_NORM")
            dense(block.pwconv1, f"{prefix}_PW0")
            dense(block.pwconv2, f"{prefix}_PW1")
            copy(block.gamma, read(f"{prefix}_GAMMA_F32", block.gamma.numel()))
        norm(model.final_norm, "FNORM")
        dense(model.head, "HEAD")
    return model


def load_audio_and_mels(manifest, pack):
    """Return aligned (log-mel [100, T], waveform) pairs and their row ids."""
    sources = {row["id"]: manifest.parent / row["audio"] for line in
               manifest.read_text(encoding="utf-8").splitlines() if line.strip()
               for row in [json.loads(line)]}
    rows = json.loads((pack / "rows.json").read_text(encoding="utf-8"))
    if not rows:
        raise ValueError("empty pack")
    items = []
    for row in rows:
        with np.load(row["chunks"][0]["tensor_npz"]) as tensors:
            target = tensors["generator_input"].astype(np.float32)
        waveform, rate = sf.read(sources[row["row_id"]], dtype="float32")
        if rate != 24_000 or waveform.ndim != 1 or len(waveform) // HOP != target.shape[-1]:
            raise ValueError(f"{row['row_id']}: audio does not match its mel target")
        items.append((row["row_id"], target, waveform[:target.shape[-1] * HOP]))
    return items


def predicted_mels(pack, checkpoint, device):
    """Acoustic-model log-mels using the true durations, keyed by row id."""
    sys.path.insert(0, str(ROOT / "vendor/sanoTTS/tools"))
    import train_roota_piper_latent_student as acoustic
    model, _ = acoustic.load_model_from_checkpoint(checkpoint, torch.device(device))
    model.eval()
    _, samples, _, _ = acoustic.load_samples(pack)
    result = {}
    with torch.no_grad():
        for sample in samples:
            features = acoustic.expand_features(sample, torch.device(device))
            result[sample.row_id] = acoustic.predict_latent_tensor(model, features).T.float().cpu().numpy()
    return result


def phase_coherence_loss(output, target, n_fft=1024, hop=256, window=None):
    """Penalise broken phase advance across frames (time) and bins (frequency).

    Incoherent phase is what makes a vocoder sound like several people talking at
    once. The offset-invariant products below ignore absolute phase, which a mel
    cannot determine, and only compare how phase moves.
    """
    spectra = [torch.stft(x, n_fft, hop, window=window, return_complex=True) for x in (output, target)]
    loss = 0.0
    for axis in (-1, -2):
        parts = []
        for spectrum in spectra:
            a, b = (spectrum[..., 1:], spectrum[..., :-1]) if axis == -1 else (spectrum[:, 1:], spectrum[:, :-1])
            parts.append(a * b.conj())
        weight = parts[1].abs()
        unit = [p / (p.abs() + 1e-6) for p in parts]
        loss = loss + ((1 - (unit[0] * unit[1].conj()).real) * weight).sum() / (weight.sum() + 1e-6)
    return loss / 2


def spectral_losses(output, audio, windows, resolutions):
    loss = 0.0
    for fft in resolutions:
        a = torch.stft(audio, fft, fft // 4, window=windows[fft], pad_mode="constant", return_complex=True).abs()
        o = torch.stft(output, fft, fft // 4, window=windows[fft], pad_mode="constant", return_complex=True).abs()
        loss = loss + (F.l1_loss(o.log1p(), a.log1p()) + F.l1_loss((o + 1e-4).log(), (a + 1e-4).log()) * 0.5
                       + (a - o).norm() / (a.norm() + 1e-6)) / len(resolutions)
    return loss


class PeriodDiscriminator(nn.Module):
    """HiFi-GAN period discriminator: folds the waveform by a period to see pitch-periodic structure."""
    def __init__(self, period, channels=(32, 64, 128, 256)):
        super().__init__()
        self.period = period
        layers, previous = [], 1
        for channel in channels:
            layers.append(nn.utils.parametrizations.weight_norm(
                nn.Conv2d(previous, channel, (5, 1), (3, 1), padding=(2, 0))))
            previous = channel
        layers.append(nn.utils.parametrizations.weight_norm(nn.Conv2d(previous, previous, (5, 1), padding=(2, 0))))
        self.layers = nn.ModuleList(layers)
        self.post = nn.utils.parametrizations.weight_norm(nn.Conv2d(previous, 1, (3, 1), padding=(1, 0)))

    def forward(self, audio):
        x = audio.unsqueeze(1)
        if x.shape[-1] % self.period:
            x = F.pad(x, (0, self.period - x.shape[-1] % self.period), mode="reflect")
        x = x.view(x.shape[0], 1, -1, self.period)
        features = []
        for layer in self.layers:
            x = F.leaky_relu(layer(x), 0.1)
            features.append(x)
        return self.post(x).flatten(1), features


class ResolutionDiscriminator(nn.Module):
    """Vocos-style discriminator on one STFT magnitude resolution: sees harmonic sharpness."""
    def __init__(self, n_fft, channels=32):
        super().__init__()
        self.n_fft = n_fft
        norm = nn.utils.parametrizations.weight_norm
        self.layers = nn.ModuleList([
            norm(nn.Conv2d(1, channels, (3, 9), padding=(1, 4))),
            norm(nn.Conv2d(channels, channels, (3, 9), stride=(1, 2), padding=(1, 4))),
            norm(nn.Conv2d(channels, channels, (3, 9), stride=(1, 2), padding=(1, 4))),
            norm(nn.Conv2d(channels, channels, (3, 9), stride=(1, 2), padding=(1, 4))),
            norm(nn.Conv2d(channels, channels, (3, 3), padding=(1, 1))),
        ])
        self.post = norm(nn.Conv2d(channels, 1, (3, 3), padding=(1, 1)))
        self.register_buffer("window", torch.hann_window(n_fft), persistent=False)

    def forward(self, audio):
        spectrum = torch.stft(audio, self.n_fft, self.n_fft // 4, window=self.window, return_complex=True)
        x = spectrum.abs().clamp_min(1e-5).log().transpose(1, 2).unsqueeze(1)  # [B, 1, frames, bins]
        features = []
        for layer in self.layers:
            x = F.leaky_relu(layer(x), 0.1)
            features.append(x)
        return self.post(x).flatten(1), features


class Discriminators(nn.Module):
    """Training-only critics; they are not part of the exported voice."""
    def __init__(self):
        super().__init__()
        self.members = nn.ModuleList([*(PeriodDiscriminator(p) for p in (2, 3, 5, 7, 11)),
                                      *(ResolutionDiscriminator(n) for n in (512, 1024, 2048))])

    def forward(self, audio):
        return [member(audio) for member in self.members]


def discriminator_loss(real, fake):
    return sum(((1 - r) ** 2).mean() + (f ** 2).mean() for (r, _), (f, _) in zip(real, fake))


def generator_adversarial_loss(real, fake):
    adversarial = sum(((1 - f) ** 2).mean() for f, _ in fake)
    matching = sum(F.l1_loss(f, r.detach()) for (_, real_features), (_, fake_features) in zip(real, fake)
                   for r, f in zip(real_features, fake_features))
    return adversarial, matching


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("pack", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--steps", type=int, default=4000)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--segment-frames", type=int, default=64)
    parser.add_argument("--lr", type=float, default=3e-4)
    parser.add_argument("--min-lr", type=float, default=2e-5)
    parser.add_argument("--phase-weight", type=float, default=1.0)
    parser.add_argument("--init", type=Path, help="Continue from a decoder checkpoint instead of heart-nano.")
    parser.add_argument("--acoustic-checkpoint", type=Path,
                        help="Also train on this acoustic model's predicted mels (what the voice sees at inference).")
    parser.add_argument("--predicted-fraction", type=float, default=0.5)
    parser.add_argument("--qat", action="store_true", help="Simulate int8 weights while training.")
    parser.add_argument("--adv-weight", type=float, default=1.0,
                        help="GAN loss weight (0 disables the discriminators).")
    parser.add_argument("--fm-weight", type=float, default=2.0, help="Discriminator feature-matching weight.")
    parser.add_argument("--recon-weight", type=float, default=15.0,
                        help="Spectral/phase loss weight relative to the GAN terms.")
    parser.add_argument("--adv-start", type=int, default=0, help="Step at which the GAN terms switch on.")
    parser.add_argument("--max-minutes", type=float, default=0,
                        help="Wall-clock budget; the schedule anneals by steps or time, whichever ends first.")
    parser.add_argument("--device", choices=("cpu", "cuda"),
                        default="cuda" if torch.cuda.is_available() else "cpu")
    args = parser.parse_args()
    if args.steps < 1 or args.output.exists():
        parser.error("choose a positive step count and a new output checkpoint")
    torch.manual_seed(42)
    rng = np.random.default_rng(42)
    items = load_audio_and_mels(args.manifest, args.pack)
    predicted = predicted_mels(args.pack, args.acoustic_checkpoint, args.device) if args.acoustic_checkpoint else {}
    model = load_shipped_decoder()
    initial = torch.load(args.init, map_location="cpu") if args.init else {}
    if initial:
        model.load_state_dict(initial["model"])
    model.to(args.device)
    adversarial = args.adv_weight > 0
    betas = (0.8, 0.99) if adversarial else (0.9, 0.999)
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, betas=betas, weight_decay=1e-4)
    critics = Discriminators().to(args.device) if adversarial else None
    if critics is not None and "discriminators" in initial:
        critics.load_state_dict(initial["discriminators"])  # stage 2 keeps the trained critics
    critic_optimizer = (torch.optim.AdamW(critics.parameters(), lr=2e-4, betas=(0.8, 0.99))
                        if critics is not None else None)
    recon_weight = args.recon_weight if adversarial else 1.0
    warmup = min(200, args.steps // 10)

    started = time.monotonic()

    def time_progress():
        return (time.monotonic() - started) / (60 * args.max_minutes) if args.max_minutes > 0 else 0.0

    def learning_rate(step):
        if step < warmup:
            return args.lr * (step + 1) / warmup
        progress = min(1.0, max((step - warmup) / max(1, args.steps - warmup), time_progress()))
        return args.min_lr + 0.5 * (args.lr - args.min_lr) * (1 + np.cos(np.pi * progress))

    resolutions = (512, 1024, 2048)
    windows = {n: torch.hann_window(n, device=args.device) for n in resolutions}
    seg = args.segment_frames
    for step in range(1, args.steps + 1):
        if time_progress() >= 1.0:
            print(f"decoder: time budget of {args.max_minutes:.1f} min reached at step {step - 1}", flush=True)
            break
        for group in optimizer.param_groups:
            group["lr"] = learning_rate(step - 1)
        if critic_optimizer is not None:
            for group in critic_optimizer.param_groups:
                group["lr"] = 2e-4 * learning_rate(step - 1) / args.lr
        mels, waves = [], []
        for _ in range(args.batch_size):
            row_id, mel, wave = items[rng.integers(len(items))]
            if predicted and rng.random() < args.predicted_fraction:
                mel = predicted[row_id]
            start = int(rng.integers(0, max(1, mel.shape[-1] - seg + 1)))
            mel_crop = mel[:, start:start + seg]
            wave_crop = wave[start * HOP:(start + mel_crop.shape[-1] - 1) * HOP]
            if mel_crop.shape[-1] < seg:  # short clip: pad with the quietest mel value and silence
                pad = seg - mel_crop.shape[-1]
                mel_crop = np.pad(mel_crop, ((0, 0), (0, pad)), mode="edge")
                wave_crop = np.pad(wave_crop, (0, (seg - 1) * HOP - len(wave_crop)))
            mels.append(mel_crop)
            waves.append(wave_crop)
        mel = torch.from_numpy(np.stack(mels)).to(args.device)
        audio = torch.from_numpy(np.stack(waves)).to(args.device)
        noise = torch.randn(len(mels), CONFIG["noise_channels"], seg, device=args.device)
        output = model.synthesize(model(mel, noise=noise, qat=args.qat), windows[1024])
        audio = audio[:, :output.shape[-1]]
        gan_on = critics is not None and step > args.adv_start
        # A waveform L1 pushes toward the phase-averaged (buzzy) signal; drop it once the GAN runs.
        waveform_weight = 0.0 if gan_on else 0.5
        loss = waveform_weight * F.l1_loss(output, audio) + spectral_losses(output, audio, windows, resolutions)
        phase = phase_coherence_loss(output, audio, window=windows[1024])
        total = recon_weight * (loss + args.phase_weight * phase)
        critic_loss = adv = matching = torch.zeros((), device=args.device)
        if gan_on:
            critic_loss = discriminator_loss(critics(audio), critics(output.detach()))
            critic_optimizer.zero_grad(set_to_none=True)
            critic_loss.backward()
            torch.nn.utils.clip_grad_norm_(critics.parameters(), 100.0, error_if_nonfinite=True)
            critic_optimizer.step()
            adv, matching = generator_adversarial_loss(critics(audio), critics(output))
            total = total + args.adv_weight * adv + args.fm_weight * matching
        optimizer.zero_grad(set_to_none=True)
        total.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 100.0, error_if_nonfinite=True)
        optimizer.step()
        if step % 100 == 0 or step == args.steps or step == 20:
            print(f"decoder {step}/{args.steps}: loss={loss.item():.4f} phase={phase.item():.4f} "
                  f"adv={adv.item():.3f} fm={matching.item():.3f} critic={critic_loss.item():.3f} "
                  f"lr={optimizer.param_groups[0]['lr']:.2e}", flush=True)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    checkpoint = {"model": model.cpu().state_dict(), "config": CONFIG}
    if critics is not None:
        checkpoint["discriminators"] = critics.cpu().state_dict()
    torch.save(checkpoint, args.output)


if __name__ == "__main__":
    main()
