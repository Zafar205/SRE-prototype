SANOTTS := vendor/sanoTTS
SANOTTS_REV := 55c6f39b2b535b5a591667a0852a6c2778320fab
PYTHON ?= python3
TRAIN_PACK ?= data/train-pack
EVAL_PACK ?= data/eval-pack
RUN_DIR ?= runs
VOICE ?= $(RUN_DIR)/int8
STEPS ?= 4000

.PHONY: upstream check-upstream train-front check-voice
upstream:
	@if [ ! -d "$(SANOTTS)/.git" ]; then \
		mkdir -p vendor && checkout=$$(mktemp -d vendor/sanoTTS.XXXXXX) && \
		trap 'rm -rf "$$checkout"' EXIT && \
		git clone --depth 1 --filter=blob:none --sparse --no-checkout https://github.com/Ampixa/sanoTTS.git "$$checkout" && \
		git -C "$$checkout" sparse-checkout set docs tools mcu/src mcu/include mcu/ports/host mcu/test mcu/models/en_us_e13b && \
		git -C "$$checkout" fetch --depth 1 origin "$(SANOTTS_REV)" && \
		git -C "$$checkout" checkout --detach FETCH_HEAD && \
		test -f "$$checkout/mcu/test/fixtures/en_us_e13b/SHA256SUMS" && \
		mv "$$checkout" "$(SANOTTS)"; \
	fi
	@test "$$(git -C "$(SANOTTS)" rev-parse HEAD)" = "$(SANOTTS_REV)" || \
		{ echo "Expected sanoTTS at $(SANOTTS_REV)"; exit 1; }

check-upstream: upstream
	cd "$(SANOTTS)/mcu/test/fixtures/en_us_e13b" && shasum -a 256 -c SHA256SUMS
	$(MAKE) -C "$(SANOTTS)/mcu" test-nano NANO_MODEL=models/en_us_e13b NANO_GOLDEN=test/fixtures/en_us_e13b

train-front: upstream
	$(PYTHON) audit_budget.py 128 --duration-hidden 32 --acoustic-hidden 48 --acoustic-depth 4
	$(PYTHON) "$(SANOTTS)/tools/train_roota_piper_duration_student.py" \
		--pack-dir "$(TRAIN_PACK)" --eval-pack-dir "$(EVAL_PACK)" --out-dir "$(RUN_DIR)/duration" \
		--hidden 32 --depth 3 --kernel-size 5 --duration-vocab-size 128 \
		--max-duration 80 --pause-token-ids "" --steps "$(STEPS)"
	$(PYTHON) "$(SANOTTS)/tools/train_roota_piper_latent_student.py" \
		--pack-dir "$(TRAIN_PACK)" --eval-pack-dir "$(EVAL_PACK)" --out-dir "$(RUN_DIR)/acoustic" \
		--architecture token_context --hidden 48 --depth 4 --token-depth 4 --kernel-size 5 \
		--vocab-size 128 --skip-render --steps "$(STEPS)"

check-voice: upstream
	$(MAKE) -C "$(SANOTTS)/mcu" test-nano NANO_MODEL="$(abspath $(VOICE))" NANO_GOLDEN="$(abspath $(VOICE))/golden"
