"use client";

import { useState } from "react";

const products = [
  { name: "Salicylic Acid 2% Gel Cleanser", use: "Reduces acne, blackheads & excess oil", price: "999", old: "1,250", rating: "4.7", tone: "#d7ddd0", kind: "cleanser" },
  { name: "Salicylic Acid 2% Serum", use: "Clarifies breakouts without drying", price: "1,650", rating: "4.8", tone: "#e6ddd2", kind: "serum" },
  { name: "Acne Control Kit", use: "Your complete clear-skin routine", price: "3,620", old: "4,030", rating: "4.7", tone: "#d3e0db", kind: "kit" },
  { name: "Salicylic Acid 2% Face Wash", use: "Refreshes oily, congested skin", price: "1,190", old: "1,320", rating: "4.8", tone: "#ece0c9", kind: "wash" },
];

const categories = ["Cleansers + Face Wash", "Toners", "Face Serums", "Face Creams", "Moisturizers", "Sunscreen (SPF)"];
const ingredients = ["Salicylic Acid (BHA)", "Vitamin C", "Kojic Acid", "Glycolic Acid (AHA)", "Niacinamide", "Retinol"];
const reviews = [
  ["4.9", "Acne finally cleared", "Struggled with breakouts for years. After five weeks of consistent use, my skin is clearer and the oil is finally under control.", "— Ayesha, Karachi"],
  ["4.8", "Even skin tone", "My tone looks much more even and fresh. The routine is simple, gentle, and genuinely works.", "— Maryam, Multan"],
  ["5.0", "Deep hydration", "My dry, tight skin finally feels plump and hydrated all day long. An absolute must-have.", "— Eman F, Lahore"],
];

function ProductArt({ kind }: { kind: string }) {
  return <div className={`product-art ${kind}`}><span className="cap"/><span className="label">NUVYLI<br/><b>SKIN LAB</b></span></div>;
}

export default function Home() {
  const [cart, setCart] = useState(0);
  const [concern, setConcern] = useState("Acne");
  const [openFaq, setOpenFaq] = useState(0);
  const faqs = [
    ["What makes Nuvyli different?", "Nuvyli is built on complete ingredient transparency. Every active and its exact concentration is clearly disclosed—no hidden blends, no empty claims."],
    ["Are Nuvyli products safe for sensitive skin?", "Yes. Our fragrance-free formulas use proven actives at effective, well-tolerated concentrations and avoid unnecessary fillers."],
    ["How long before I see results?", "Skin renews in cycles. Most people see a visible difference in four to six weeks of consistent use."],
    ["Can I use multiple products together?", "Absolutely. Build a focused routine: cleanse, treat, moisturize, and protect with SPF each morning."],
  ];
  return <main>
    <div className="announcement">✦ Trusted by 30,000+ happy customers ✦</div>
    <header>
      <a className="brand" href="#top">Nuvyli<sup>®</sup></a>
      <nav><a href="#shop">BEST SELLERS</a><a href="#shop">BUNDLE OFFER</a><a href="#concerns">BY CATEGORY⌄</a><a href="#ingredients">BY INGREDIENTS⌄</a><a href="#routine">BUILD YOUR ROUTINE</a><a href="#reviews">REVIEWS</a></nav>
      <div className="actions"><span className="search">⌕ <i>Search for cleanser, serum...</i></span><button aria-label="Cart" onClick={() => setCart(cart + 1)}>Bag <b>{cart}</b></button></div>
    </header>

    <section className="hero" id="top">
      <div className="hero-copy"><p className="stars">★★★★★ <b>4.8</b></p><small>Trusted by <strong>30,000+</strong> customers</small><h1>Say goodbye<br/>to acne.</h1><h3>Salicylic Acid 2% targets pimples and oil.</h3><p>Clear buildup that causes pimples. Most see visibly clearer skin in 4–6 weeks—fragrance-free, even for sensitive skin.</p><a className="orange-btn" href="#shop">Start clearing</a></div>
      <div className="hero-image"><div className="dropper"/><div className="serum-drop"/></div>
    </section>
    <section className="promise"><div><b>⚗</b><span><strong>Backed by science</strong><small>Clinically proven actives, real results.</small></span></div><div><b>✓</b><span><strong>Dermatologist tested</strong><small>Made for real skin and routines.</small></span></div><div><b>◇</b><span><strong>Fragrance free</strong><small>Safe for sensitive skin.</small></span></div><div><b>♧</b><span><strong>Ingredient transparency</strong><small>Every concentration disclosed.</small></span></div></section>

    <section className="section" id="concerns"><h2>Shop by concern</h2><div className="tabs">{["Acne", "Brightening", "Dark Spots", "Anti-Aging", "Hydration & Barrier Repair"].map(x => <button className={concern === x ? "active" : ""} onClick={() => setConcern(x)} key={x}>{x}</button>)}</div><p className="section-intro">Targeted formulas for {concern.toLowerCase()}—simple enough to keep using.</p><div className="product-grid">{products.map((p, i) => <article className="product" key={p.name}><div className="product-photo" style={{background:p.tone}}>{i === 0 && <em>-20%</em>}<ProductArt kind={p.kind}/></div><p className="rating">★ {p.rating} <span>(167)</span></p><h3>{p.name}</h3><p className="use">{p.use}</p><p className="price">{p.old && <del>Rs.{p.old}</del>} Rs.{p.price}</p><button onClick={() => setCart(cart + 1)}>ADD TO CART</button></article>)}</div></section>

    <section className="section best" id="shop"><p className="eyebrow">ESSENTIALS FOR EVERY ROUTINE</p><h2>Best sellers & bundles</h2><div className="product-grid">{[products[1], products[2], {...products[0], name:"Vitamin C 10% Serum", tone:"#f3d9a5", kind:"serum"}, {...products[3], name:"Barrier Repair Moisturizer", tone:"#d8e5e4", kind:"kit"}].map(p => <article className="product" key={p.name}><div className="product-photo" style={{background:p.tone}}><ProductArt kind={p.kind}/></div><p className="rating">★ {p.rating} <span>(92)</span></p><h3>{p.name}</h3><p className="use">{p.use}</p><p className="price">Rs.{p.price}</p><button onClick={() => setCart(cart + 1)}>ADD TO CART</button></article>)}</div></section>

    <section className="categories section"><h2>Shop by category</h2><div className="category-row">{categories.map((x,i) => <a href="#shop" key={x}><div className={`cat-img c${i}`}/><span>{x}</span></a>)}</div></section>
    <section className="ingredients section" id="ingredients"><div><p className="eyebrow">FORMULATED WITH PURPOSE</p><h2>Shop by ingredients</h2><p>Every ingredient earns its place. Explore the proven actives behind your routine.</p><a className="text-link" href="#shop">Explore all products →</a></div><div className="ingredient-list">{ingredients.map((x,i) => <a href="#shop" key={x}><span>0{i+1}</span>{x}<b>↗</b></a>)}</div></section>

    <section className="routine" id="routine"><div><p className="eyebrow">A SIMPLE PATH TO YOUR BEST SKIN</p><h2>Build your routine,<br/>not a shelf.</h2><p>Answer a few quick questions and discover a routine built around your actual skin goals.</p><a className="orange-btn" href="#shop">Build my routine</a></div><div className="routine-art"><div className="circle"/><ProductArt kind="serum"/><ProductArt kind="cleanser"/></div></section>
    <section className="section review-section" id="reviews"><p className="eyebrow">REAL PEOPLE, REAL RESULTS</p><h2>Words from your skin community</h2><div className="reviews">{reviews.map(r => <article key={r[1]}><p className="rating">★★★★★ <b>{r[0]}</b></p><h3>{r[1]}</h3><p>“{r[2]}”</p><small>{r[3]}</small></article>)}</div></section>
    <section className="about"><div className="about-art"><span>N</span></div><div><p className="eyebrow">ABOUT NUVYLI</p><h2>Science-backed skincare, made simple.</h2><p>Every Nuvyli formula is developed with dermatologist insight—for safety, purity, and results you can actually see. No hidden ingredients. No empty claims. Just effective actives at honest prices.</p><div className="about-points"><span>✓ Full transparency</span><span>✓ Effective formulas</span><span>✓ Made accessible</span><span>✓ Globally sourced</span></div></div></section>
    <section className="faq section"><div><p className="eyebrow">FAQs</p><h2>Ingredients to delivery</h2><p>Got questions before you buy? Here are answers to what our community asks most.</p></div><div>{faqs.map((f,i) => <article className={openFaq === i ? "faq-open" : ""} key={f[0]}><button onClick={() => setOpenFaq(i)}>{f[0]} <b>{openFaq === i ? "−" : "+"}</b></button>{openFaq === i && <p>{f[1]}</p>}</article>)}</div></section>
    <section className="assurances"><div>▣<strong>Secure payment</strong><span>Card, wallet or cash on delivery.</span></div><div>◌<strong>Here to help</strong><span>Questions? We're a message away.</span></div><div>✦<strong>Free delivery</strong><span>On orders over Rs. 1,899.</span></div></section>
    <footer><div><a className="brand" href="#top">Nuvyli<sup>®</sup></a><p>Pakistan's science-backed skincare brand, simplifying your journey to healthy, glowing skin.</p><p>hello@nuvyli.pk<br/>+92 300 123 4567</p></div><div><h4>Shop</h4><a href="#shop">Best sellers</a><a href="#shop">Cleansers</a><a href="#shop">Serums</a><a href="#shop">Bundles & kits</a></div><div><h4>Learn</h4><a href="#ingredients">Ingredients</a><a href="#routine">Build your routine</a><a href="#reviews">Reviews</a><a href="#faq">FAQs</a></div><div><h4>Stay in the loop</h4><p>Skincare notes, new formulas, and offers.</p><div className="email">your@email.com <b>→</b></div></div><small className="copyright">© 2026 Nuvyli. All rights reserved.</small></footer>
  </main>;
}
