'use client';

import { useEffect } from 'react';
import { startPrototype } from './prototype';

export default function Home() {
  useEffect(() => startPrototype(), []);

  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <aside className="sidebar">
        <a className="brand" href="#home"><span data-icon="brand" />smallsteps<span className="brand-dot">.</span></a>
        <nav id="nav" aria-label="Main navigation" />
        <div className="side-bottom">
          <a className="switch" id="switch" href="#team">Care team workspace</a>
          <button className="reset" data-action="reset">Reset demo</button>
        </div>
      </aside>
      <div className="shell">
        <header className="top">
          <div id="where">My care / Overview</div>
          <div className="top-right">
            <span className="demo">Interactive demo</span>
            <a className="avatar" href="#membership" aria-label="Amina’s membership">AK</a>
          </div>
        </header>
        <main id="main" tabIndex={-1}>
          <div className="heading">
            <span className="overline">GLP-1 TELEMEDICINE</span>
            <h1>Welcome, Amina</h1>
            <p>Loading your sample care dashboard…</p>
          </div>
        </main>
        <footer>Fictional demo data. Changes stay in this browser. Use sample information during walkthroughs.</footer>
      </div>
      <dialog id="dialog" />
      <div id="toast" role="status" aria-live="polite" />
    </>
  );
}
