const paths = {
  brand:'<path d="M4 12c0-5 4-8 9-8 0 5-3 9-8 9m5 7c0-5 4-8 10-8 0 5-3 9-8 9M5 20 17 7"/>',
  home:'<path d="m3 10 9-7 9 7v10H3zM9 20v-6h6v6"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18"/>',
  leaf:'<path d="M20 4C7 3 3 9 6 15s15 4 14-11ZM4 20 15 9"/>',
  chart:'<path d="M3 3v18h18M7 15l4-4 4 2 5-6"/>',
  lab:'<path d="M9 3h6m-5 0v7l-5 8a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-8V3M8 15h8"/>',
  wallet:'<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18m-14 5h4"/>',
  arrow:'<path d="M4 12h15m-6-6 6 6-6 6"/>',
  switch:'<path d="M4 8h15m-4-4 4 4-4 4M20 16H5m4-4-4 4 4 4"/>',
  check:'<path d="m4 12 5 5L20 6"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/>',
  video:'<rect x="3" y="6" width="12" height="12" rx="2"/><path d="m15 10 6-4v12l-6-4"/>',
  meds:'<path d="m9 5-4 4a7 7 0 0 0 10 10l4-4A7 7 0 0 0 9 5ZM8 8l8 8"/>',
  warning:'<circle cx="12" cy="12" r="9"/><path d="M12 7v6m0 3v1"/>',
};
const icon = name => `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`;
export function startPrototype() {
  const listeners = new AbortController();
  const { signal } = listeners;
  document.querySelector('[data-icon=brand]').innerHTML = icon('brand');

  const fresh = () => ({
    day:0, slot:'', tried:false, booking:null, lastBooking:null, draft:null, visitDone:false,
    intake:null, report:'Baseline metabolic panel.pdf', reminders:true, member:false,
    entries:[{date:'Nov 7',weight:86.8,symptom:'None'},{date:'Nov 14',weight:86.3,symptom:'Low energy'},{date:'Nov 21',weight:85.9,symptom:'None'}],
    plan:['Yogurt, oats and banana','Chickpea and cucumber bowl','Lentil dal, roti and greens'],
    planNote:'Prep the chickpeas and chop the cucumber the evening before.',
    meds:false
  });
  const key = 'smallsteps-glp1-demo-v1';
  let state = fresh();
  try { state = {...state,...JSON.parse(localStorage.getItem(key))}; } catch {}
  const save = () => { try { localStorage.setItem(key,JSON.stringify(state)); } catch {} };
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const days = [
    {label:'Mon, Nov 23', slots:[['a','10:00 AM',false],['b','12:30 PM',true],['c','5:30 PM',true]]},
    {label:'Tue, Nov 24', slots:[['d','9:30 AM',true],['e','1:00 PM',true],['f','4:00 PM',true]]},
    {label:'Wed, Nov 25', slots:[['g','11:00 AM',true],['h','2:30 PM',true],['i','6:00 PM',true]]}
  ];
  const recommendation = {
    drug:'Semaglutide',
    formulation:'Wegovy injection',
    dose:'0.25',
    schedule:'Once weekly',
    duration:'First 4 weeks',
    route:'Subcutaneous injection',
    note:'We’ll review how you’re feeling at your follow-up before discussing any dose changes.',
    source:'https://www.accessdata.fda.gov/drugsatfda_docs/label/2026/218316s005lbl.pdf'
  };
  const doctors = {screening:'Dr. Rania Malik',followup:'Dr. Noor Rahman'};
  const slot = id => days.flatMap(d=>d.slots.map(s=>({id:s[0],time:s[1],available:s[2],day:d.label}))).find(s=>s.id===id);
  const visitType = () => state.draft?.type || 'screening';
  const main = document.querySelector('main');
  const dialog = document.querySelector('dialog');
  const link = (label, route, secondary=false, symbol='') => `<a class="button${secondary?' secondary':''}" href="#${route}">${symbol?icon(symbol):''}${label}</a>`;
  const button = (label, action, secondary=false, symbol='') => `<button class="button${secondary?' secondary':''}" type="button" data-action="${action}">${symbol?icon(symbol):''}${label}</button>`;
  const back = (route, label='Back') => `<a class="back" href="#${route}">‹ ${label}</a>`;
  const heading = (tag,title,copy='') => `<div class="heading"><span class="overline">${tag}</span><h1>${title}</h1>${copy?`<p>${copy}</p>`:''}</div>`;
  const pill = (label, mode='done') => `<span class="pill ${mode}">${icon(mode==='done'?'check':mode==='wait'?'clock':'warning')}${label}</span>`;
  const field = (label, name, val, type='text', attrs='') => `<label class="field">${label}<input type="${type}" name="${name}" value="${esc(val)}" ${attrs}></label>`;
  const steps = active => `<ol class="stepper">${['Intake','Lab report','Choose a time','Review'].map((s,i)=>`<li ${i===active?'aria-current="step"':''}>${i+1}. ${s}</li>`).join('')}</ol>`;
  const row = (sym,title,desc,extra='') => `<div class="row"><span class="icon-box">${icon(sym)}</span><div class="grow"><h3>${title}</h3><small>${desc}</small></div>${extra}</div>`;
  const toast = message => { const el=document.querySelector('#toast');el.textContent=message;clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.textContent='',4200); };
  const go = route => { if(location.hash===`#${route}`) render(); else location.hash=route; };
  const routeNames = {home:'Overview',intake:'Intake',upload:'Lab screening',care:'Consultations',schedule:'Choose a time',unavailable:'Time unavailable',review:'Review booking',success:'Booking status',room:'Video room',summary:'Visit summary',nutrition:'Meal plan',medication:'Medication',progress:'Progress',labs:'Lab reports',membership:'Membership',team:'Care team',doctor:'Visit review',dietitian:'Meal plan builder',test:'Walkthrough guide'};
  const nav = [['home','home'],['care','calendar'],['medication','meds'],['nutrition','leaf'],['progress','chart'],['labs','lab'],['membership','wallet']];
  const teamNav = [['team','home'],['doctor','video'],['dietitian','leaf']];
  let activeRoute;
  const pages = {};

  pages.home = () => `${heading('GLP-1 TELEMEDICINE','Welcome, Amina','Your doctor visits, medication plan and weekly follow-up in one place.')}
  <section class="hero"><div class="hero-photo" aria-hidden="true"></div><div class="hero-copy"><span class="overline">YOUR NEXT STEP</span>
  <h2>${state.booking?'Your visit is booked':state.visitDone?'Keep up with your plan':'Start with a care visit'}</h2>
  <p>${state.booking?'Review your appointment details or try the simulated video room.':state.visitDone?'See your meals for the week and add your next check-in.':'Book a 15-minute video screening to talk with a doctor about GLP-1 treatment and ongoing support.'}</p>
  ${link(state.booking?'View appointment':state.visitDone?'Open meal plan':'Start intake',state.booking?'success':state.visitDone?'nutrition':'intake',false,'arrow')}</div></section>
  <div class="section-head"><h2>Your care at a glance</h2></div>
  <div class="grid three">
  <a class="card tile" href="#care"><span class="icon-box">${icon('calendar')}</span><h3>Consultations</h3><p>${state.booking?`${state.booking.day}, ${state.booking.time}`:'Find a time for a video visit.'}</p></a>
  <a class="card tile" href="#nutrition"><span class="icon-box purple">${icon('leaf')}</span><h3>Meal plan</h3><p>See this week’s meals and grocery list.</p></a>
  <a class="card tile" href="#progress"><span class="icon-box yellow">${icon('chart')}</span><h3>Weekly check-in</h3><p>Log your weight and how you feel.</p></a>
  </div><div class="card group">${row('meds','Doctor’s medication recommendation','Explore a sample semaglutide plan.',link('View medication','medication',true))}</div>
  <div class="group"><a class="text-link" href="#test">Walkthrough guide</a></div>`;

  pages.intake = () => `${back('home','Overview')}${heading('GETTING STARTED','About you','Use the prefilled sample answers or edit them for the demo.')}${steps(0)}
  <form class="card narrow" id="intake-form">
  <div class="form-grid">${field('Name','name',state.intake?.name||'Amina Khan','text','required maxlength="60"')}
  ${field('Current weight (kg)','weight',state.intake?.weight||'85.9','number','required min="35" max="350" step="0.1"')}</div>
  <label class="field">What would you like to work on?<textarea name="goal" rows="2" maxlength="240" required>${esc(state.intake?.goal||'Build a meal routine around my workday and check my progress weekly.')}</textarea></label>
  <label class="field">Anything you’d like your doctor to know?<textarea name="notes" rows="2" maxlength="240">${esc(state.intake?.notes||'I usually get home after 7 PM, so I prefer evening appointments.')}</textarea></label>
  <div class="actions"><button class="button">Continue to lab screening ${icon('arrow')}</button></div></form>`;
  pages.upload = () => `${back('intake','Intake')}${heading('GETTING STARTED','Lab screening','Attach a sample report for your doctor to review at the visit.')}${steps(1)}${reportCard('Choose a consultation','care')}`;
  function reportCard(next, route) {
    return `<section class="card narrow">${row('lab',esc(state.report||'No report attached'),state.report?'Demo attachment available for review':'You can add a report later',state.report?pill('Attached'):'')}
  <div class="actions">${button('Attach sample report','sample-report',true)}${button('Choose a demo file','upload-file',true)}<input id="demo-file" type="file" accept=".pdf,.jpg,.jpeg,.png" hidden></div>
  <p class="muted group">The demo stores the filename only.</p>${next?`<div class="actions">${link(next,route,false,'arrow')}</div>`:''}</section>`;
  }

  pages.care = () => `${heading('YOUR CARE','Consultations','Pick a date and open a visit to choose a time. All appointments are fictional and shown in PKT.')}
  ${state.booking?`<div class="callout">${row('check','Appointment confirmed',`${state.booking.day} at ${state.booking.time} · ${state.booking.ref}`,link('View booking','success',true))}</div>`:state.lastBooking?`<div class="callout">${row(state.lastBooking.status==='Cancelled'?'warning':'check',`Appointment ${state.lastBooking.status.toLowerCase()}`,state.lastBooking.ref,link('View status','success',true))}</div>`:''}
  <div class="tabbar" role="group" aria-label="Appointment date">${days.map((d,i)=>`<button type="button" data-day="${i}" aria-pressed="${i===state.day}">${d.label}</button>`).join('')}</div>
  <section class="card narrow list">${Object.entries(doctors).map(([type,doctor])=>row('video',doctor,`${type==='screening'?'Initial screening':'Weekly follow-up'} · 15 min · ${days[state.day].label}`,`<button class="button secondary" type="button" data-visit="${type}">View times</button>`)).join('')}</section>
  ${state.visitDone?`<div class="group">${link('View visit summary','summary',true)}</div>`:''}`;

  pages.schedule = () => `${back('care','Consultations')}${heading('BOOK A VIDEO VISIT','Choose a time','Select a time and check whether it is still available.')}${steps(2)}
  <form class="card narrow" id="schedule-form">
  ${row('video',doctors[visitType()],`${days[state.day].label} · 15 min · PKT`)}
  <label class="field group">Visit topic<input name="topic" required maxlength="120" value="${esc(state.draft?.topic||'Review my goals and weekly routine')}"></label>
  <fieldset><legend>Appointment time</legend>
  ${days[state.day].slots.map(([id,time,available])=>`<label class="option"><input type="radio" name="slot" value="${id}" required ${state.slot===id?'checked':''} ${state.tried&&!available?'disabled':''}><span>${time}</span>${state.tried&&!available?pill('Unavailable','error'):''}</label>`).join('')}</fieldset>
  <div class="actions"><button class="button" id="check-time">Check availability ${icon('arrow')}</button><a class="text-link" href="#care">Change date or doctor</a></div>
  <p id="availability-status" class="muted" role="status"></p></form>`;
  pages.unavailable = () => {
    const attempted=slot(state.slot);
    const alternative=slot('b');
    return `${back('schedule','Appointment times')}${heading('BOOK A VIDEO VISIT','That time was just taken',`${attempted?.day||'Mon, Nov 23'} at ${attempted?.time||'10:00 AM'} is unavailable. Your visit details are saved.`)}
  <section class="card narrow">${row('clock','Next available time',`${alternative.day} at ${alternative.time} · PKT · ${doctors[visitType()]}`)}
  <div class="actions">${button('Use 12:30 PM','recover',false,'arrow')}${link('Pick another time','schedule',true)}</div></section>`;
  };
  pages.review = () => {
    const chosen=slot(state.slot);
    if(!chosen?.available) return `${heading('BOOK A VIDEO VISIT','Review booking','Choose an available time to continue.')}${link('Choose a time','schedule')}`;
    return `${back('schedule','Appointment times')}${heading('BOOK A VIDEO VISIT','Review your booking','Check your appointment details before confirming.')}${steps(3)}
  <section class="card narrow list">
  ${row('video',doctors[visitType()],`${visitType()==='screening'?'Initial screening':'Weekly follow-up'} · 15 minutes · Video`)}
  ${row('calendar',`${chosen.day} at ${chosen.time}`,'Pakistan Standard Time (PKT)')}
  ${row('leaf','Visit topic',esc(state.draft?.topic||'Review my goals and weekly routine'))}
  <div class="actions">${button('Confirm booking','confirm',false,'check')}${link('Change time','schedule',true)}</div></section>`;
  };
  pages.success = () => {
    const booking = state.booking || state.lastBooking;
    if(!booking) return `${back('care','Consultations')}${heading('YOUR CARE','Appointment status','Your confirmed visit will appear here.')}${link('Find a time','care')}`;
    return `${back('care','Consultations')}${heading('APPOINTMENT STATUS',`Visit ${booking.status.toLowerCase()}`)}
  <div class="card narrow list">${row('calendar',`${booking.day} at ${booking.time} PKT`,`${doctors[booking.type]} · 15-minute video visit`,pill(booking.status,booking.status==='Cancelled'?'error':'done'))}
  ${row('check',booking.ref,'Booking reference')}
  ${row('leaf','Visit topic',esc(booking.topic))}
  <div class="actions">${state.booking?link('Open video room','room',false,'video'):booking.status==='Completed'?link('View visit summary','summary'):link('Book another visit','care')}
  ${state.booking?button('Cancel booking','cancel-booking',true):''}<a class="text-link" href="#care">Return to consultations</a></div></div>`;
  };
  pages.room = () => `${back('success','Appointment')}${heading('VIDEO CONSULTATION','Video visit','Try the waiting room and finish a simulated consultation.')}
  ${state.booking?`<div class="card narrow"><div class="room"><div><div class="initials">${state.booking.type==='screening'?'RM':'NR'}</div><h3>${doctors[state.booking.type]}</h3><p>${state.booking.joined?'Demo visit in progress':'Ready to join the demo waiting room'}</p></div></div><div class="actions">${state.booking.joined?button('Finish demo visit','finish',false,'check'):button('Join demo visit','join',false,'video')}${link('Back to appointment','success',true)}</div></div>`:link('Find a consultation','care')}`;
  pages.summary = () => `${back('care','Consultations')}${heading('YOUR CARE','Visit summary','Review your care team’s next steps.')}
  <section class="card narrow list">${row('video','Video consultation',state.visitDone?'Demo visit completed':'Sample visit summary',state.visitDone?pill('Completed'):pill('Sample','wait'))}
  ${row('lab','Screening and report review',state.meds?'Demo safety checklist recorded':'Discuss the attached sample report with your doctor')}
  ${row('meds','Medication recommendation',state.meds?'Your doctor shared a demo recommendation':'Preview the sample semaglutide plan',link('View medication','medication',true))}
  ${row('leaf','Weekly meal plan','Three meal ideas and a grocery list',link('Open plan','nutrition',true))}
  ${row('chart','Next check-in','Record your weight and how you feel',link('Log check-in','progress',true))}
  <div class="actions">${link('Book a follow-up','care',true)}</div></section>`;

  pages.medication = () => `${back(state.visitDone?'summary':'home',state.visitDone?'Visit summary':'Overview')}
  ${heading('GLP-1 TREATMENT','Medication recommendation','See the dose, schedule and follow-up note shared by your doctor in this example.')}
  <div class="grid">
    <section class="card dose-card" aria-labelledby="med-name">
      <div class="section-head"><span class="overline">DOCTOR RECOMMENDATION</span>${pill(state.meds?'Shared in demo':'Sample recommendation',state.meds?'done':'wait')}</div>
      <h2 id="med-name">${recommendation.drug}</h2>
      <p class="muted">${recommendation.formulation}</p>
      <div class="dose-display"><strong>${recommendation.dose}</strong><span>mg</span></div>
      <dl class="dose-details"><div><dt>Frequency</dt><dd>${recommendation.schedule}</dd></div><div><dt>Duration</dt><dd>${recommendation.duration}</dd></div><div><dt>Route</dt><dd>${recommendation.route}</dd></div></dl>
    </section>
    <section class="card">
      ${row('video',doctors.screening,'Recommending doctor · Fictional profile')}
      <div class="callout"><h3>Doctor’s follow-up note</h3><p>${recommendation.note}</p></div>
      <p class="muted">Fictional example for the prototype. Use your own doctor’s instructions for actual treatment.</p>
      <div class="actions">${link('Book a follow-up','care',false,'calendar')}</div>
      <a class="text-link" href="${recommendation.source}" target="_blank" rel="noopener noreferrer">Sample dose reference (FDA)</a>
    </section>
  </div>`;

  pages.nutrition = () => `${back('home','Overview')}${heading('YOUR NUTRITION','Weekly meal plan','Sample plan for 23–29 November, prepared by Leena Shah, dietitian.')}
  <div class="grid"><section class="card list">${state.plan.map((meal,i)=>row('leaf',['Breakfast','Lunch','Dinner'][i],esc(meal))).join('')}</section>
  <section class="card"><h3>Grocery list</h3><ul class="checklist"><li>Plain yogurt, oats and bananas</li><li>Chickpeas and cucumbers</li><li>Lentils, roti and leafy greens</li></ul><h3>Prep note</h3><p>${esc(state.planNote)}</p></section></div>
  <div class="actions">${link('Log this week’s check-in','progress',false,'arrow')}</div>`;

  pages.progress = () => {
    const entries=state.entries.slice(-7);
    const values=entries.map(e=>e.weight);
    const min=Math.min(...values)-.5,max=Math.max(...values)+.5;
    const points=values.map((v,i)=>[12+i*376/(values.length-1),128-(v-min)/(max-min)*108]);
    return `${back('home','Overview')}${heading('YOUR PROGRESS','Weekly check-ins','Track weight alongside symptoms so you can discuss patterns at your next visit.')}
  <div class="grid"><section class="card"><h3>Weight history</h3><div class="stat"><strong class="big-number">${values.at(-1).toFixed(1)}</strong> kg</div>
  <svg class="chart" role="img" aria-label="Weight log chart. Individual measurements follow in the recent entries list." viewBox="0 0 400 145" preserveAspectRatio="none"><path d="M 8 130 H 392 M 8 80 H 392 M 8 30 H 392" stroke="#dce5d5" fill="none"/><polyline points="${points.map(p=>p.join(',')).join(' ')}" stroke="#56774a" stroke-width="3" fill="none" vector-effect="non-scaling-stroke"/>${points.map(([x,y])=>`<circle cx="${x}" cy="${y}" r="4" fill="#314c35"/>`).join('')}</svg><div class="axis"><span>${esc(entries[0].date)}</span><span>${esc(entries.at(-1).date)}</span></div></section>
  <form class="card" id="progress-form"><h3>Log a check-in</h3>${field('Weight (kg)','weight',values.at(-1),'number','required min="35" max="350" step="0.1"')}
  <label class="field">How have you felt?<select name="symptom"><option>None</option><option>Low energy</option><option>Nausea</option><option>Headache</option><option>Other</option></select></label>
  <button class="button">Save check-in</button></form></div>
  <div class="group section-head"><h2>Recent entries</h2></div><section class="card list">${[...entries].reverse().map(e=>row('chart',`${e.weight.toFixed(1)} kg`,`${esc(e.date)} · Symptoms: ${esc(e.symptom)}`)).join('')}</section>`;
  };
  pages.labs = () => `${back('home','Overview')}${heading('YOUR RECORDS','Lab reports','Manage demo attachments and explore a fictional lab trend.')}${reportCard()}
  <section class="card narrow stack list"><h3>Sample HbA1c trend</h3>${row('lab','5.8%','21 Nov 2026 · Sample result')}${row('lab','5.9%','17 Oct 2026 · Sample result')}</section>`;

  pages.membership = () => `${back('home','Overview')}${heading('YOUR ACCOUNT','Membership','Review the monthly fee and choose a reminder preference.')}
  <div class="grid"><section class="card"><span class="overline">MONTHLY CARE PLAN</span><div class="price">PKR 7,500 <small>/ month</small></div>
  <ul class="checklist"><li>Initial doctor video screening</li><li>Weekly check-in and dietitian planning</li><li>Medication and lab fees billed separately</li></ul>
  <p class="muted">Illustrative pricing for this prototype.</p>
  <div class="actions">${state.member?pill('Demo plan active'):button('Activate demo plan','activate')}</div></section>
  <form class="card" id="reminder-form"><h3>Appointment reminders</h3><p>Try the SMS reminder preference for upcoming visits.</p>
  <label class="option"><input type="checkbox" name="reminders" ${state.reminders?'checked':''}> SMS reminders</label>
  <div class="actions"><button class="button">Save preference</button></div></form></div>`;

  pages.team = () => `${back('home','Patient workspace')}${heading('CARE TEAM WORKSPACE','Amina Khan','Review this sample patient’s visit and publish her weekly meal plan.')}
  <div class="grid"><a class="card tile" href="#doctor"><span class="icon-box">${icon('video')}</span><h3>Doctor review</h3><p>Review intake and labs. Complete the checklist and share a sample medication recommendation.</p></a><a class="card tile" href="#dietitian"><span class="icon-box purple">${icon('leaf')}</span><h3>Dietitian workspace</h3><p>Update three meal ideas and publish them to the patient view.</p></a></div>`;
  pages.doctor = () => `${back('team','Care team')}${heading('CARE TEAM WORKSPACE','Doctor review','Review the sample intake and labs before sharing a medication recommendation.')}`
  + `<section class="card narrow list">${row('leaf','Patient goal',esc(state.intake?.goal||'Build a meal routine around my workday.'))}${row('lab','Attached report',esc(state.report||'No attachment'))}</section>
  <form class="card narrow stack" id="safety-form"><h3>Prescription safety checklist</h3><p>Complete the checks to share the fixed sample recommendation for semaglutide (Wegovy injection).</p>
  ${['Reviewed intake and reported history','Reviewed available sample labs','Recorded medication counseling discussion'].map(x=>`<label class="option"><input name="checked" type="checkbox" required ${state.meds?'checked':''}>${x}</label>`).join('')}
  <div class="callout"><h3>Sample recommendation</h3><p>${recommendation.drug} · ${recommendation.dose} mg · ${recommendation.schedule.toLowerCase()} · ${recommendation.duration.toLowerCase()}</p></div>
  <div class="actions"><button class="button">Share sample recommendation</button>${state.meds?pill('Shared in demo'):''}</div>
  <div class="actions">${link('View patient medication screen','medication',true)}</div></form>`;
  pages.dietitian = () => `${back('team','Care team')}${heading('CARE TEAM WORKSPACE','Meal plan builder','Edit this week’s meal suggestions for Amina and publish the updates.')}
  <form class="card narrow" id="meal-form">${state.plan.map((m,i)=>field(['Breakfast','Lunch','Dinner'][i],`meal${i}`,m,'text','required maxlength="100"')).join('')}
  <label class="field">Prep note<textarea name="note" rows="2" maxlength="240" required>${esc(state.planNote)}</textarea></label>
  <div class="actions"><button class="button">Publish weekly plan</button>${link('View patient meal plan','nutrition',true)}</div></form>`;

  pages.test = () => `${back('home','Overview')}${heading('WALKTHROUGH GUIDE','Try the prototype','Use these tasks for a 10-minute walkthrough. Begin with Reset demo.')}
  <div class="card narrow list">${row('calendar','Book and recover','Start intake, attach the sample lab report and open Dr. Rania Malik’s Monday visit. The 10:00 AM slot always fails the first availability check. Try the 12:30 PM suggestion, confirm and find the reference.')}
  ${row('video','Finish a visit','Join and finish the demo video visit. Find the doctor’s semaglutide recommendation, then log a symptom with your weekly check-in.')}
  ${row('leaf','Publish a meal plan','Switch to the care team, update the lunch suggestion and verify it in the patient view.')}
  ${row('check','Share feedback','Tell your facilitator what worked, where you hesitated and what you would change. Share observations using participant codes.')}
  <div class="actions">${link('Start intake','intake',false,'arrow')}${link('Explore consultations','care',true)}</div></div>`;

  function render() {
    const route=location.hash.slice(1);
    activeRoute=Object.hasOwn(pages,route)?route:'home';
    const team=teamNav.some(([name])=>name===activeRoute);
    document.querySelector('#nav').innerHTML=`<div class="nav-label">${team?'CARE TEAM':'PATIENT WORKSPACE'}</div>`+(team?teamNav:nav).map(([name,sym])=>`<a class="nav-item" href="#${name}" ${name===activeRoute?'aria-current="page"':''}>${icon(sym)}${routeNames[name]}</a>`).join('');
    const switcher=document.querySelector('#switch');
    switcher.href=team?'#home':'#team';
    switcher.innerHTML=icon('switch')+(team?'Patient workspace':'Care team workspace');
    document.querySelector('#where').textContent=`${team?'Care team':'My care'} / ${routeNames[activeRoute]}`;
    document.title=`${routeNames[activeRoute]} · Smallsteps`;
    main.innerHTML=pages[activeRoute]();
  }
  function confirmDialog(title, copy, label, action) {
    dialog.innerHTML=`<form method="dialog"><div class="section-head"><h2 id="dialog-title">${title}</h2><button class="close" aria-label="Close dialog">×</button></div><p>${copy}</p><div class="actions"><button class="button" type="button" data-action="${action}">${label}</button><button class="button secondary" autofocus>Keep current state</button></div></form>`;
    dialog.setAttribute('aria-labelledby','dialog-title');
    dialog.showModal();
  }
  const actions = {
    reset:()=>confirmDialog('Reset this demo?','This clears the prototype changes in this browser.','Reset demo','reset-confirm'),
    'reset-confirm':()=>{dialog.close();state=fresh();save();go('home');toast('Demo reset.');},
    'sample-report':()=>{state.report='Sample baseline metabolic panel.pdf';save();render();toast('Sample lab report attached.');},
    'upload-file':()=>document.querySelector('#demo-file')?.click(),
    recover:()=>{state.slot='b';state.day=0;save();go('review');},
    confirm:()=>{
      const chosen=slot(state.slot);
      if(!chosen?.available)return;
      if(state.booking){go('success');toast('Cancel or complete your current visit before making a new booking.');return;}
      const suffix=String(crypto.getRandomValues(new Uint32Array(1))[0]%10000).padStart(4,'0');
      state.booking={...chosen,type:visitType(),topic:state.draft?.topic,ref:`SS-${chosen.day.match(/\d+/)[0]}NOV-${suffix}`,status:'Confirmed'};
      save();go('success');
    },
    'cancel-booking':()=>confirmDialog('Cancel this appointment?','The booking will be marked cancelled and the slot will appear as available.','Cancel appointment','cancel-confirm'),
    'cancel-confirm':()=>{dialog.close();if(state.booking){state.lastBooking={...state.booking,status:'Cancelled'};state.booking=null;save();}render();toast('Appointment cancelled.');},
    join:()=>{if(state.booking){state.booking.joined=true;save();render();}},
    finish:()=>{if(state.booking){state.lastBooking={...state.booking,status:'Completed'};state.booking=null;state.visitDone=true;save();go('summary');}},
    activate:()=>{state.member=true;save();render();toast('Demo membership activated.');}
  };
  document.addEventListener('click',event=>{
    const button=event.target.closest('button');
    if(!button)return;
    if(button.dataset.action)actions[button.dataset.action]?.();
    if(button.dataset.day!==undefined){state.day=Number(button.dataset.day);state.slot='';save();render();document.querySelector(`[data-day="${state.day}"]`)?.focus();}
    if(button.dataset.visit){state.draft={...state.draft,type:button.dataset.visit};state.slot='';save();go('schedule');}
  }, { signal });
  document.addEventListener('change',event=>{
    if(event.target.id!=='demo-file'||!event.target.files.length)return;
    const file=event.target.files[0];
    if(!/\.(pdf|png|jpe?g)$/i.test(file.name)){toast('Choose a PDF, PNG or JPG demo file.');return;}
    state.report=file.name;save();render();toast('Demo filename added.');
  }, { signal });
  document.addEventListener('submit',event=>{
    const form=event.target;
    if(!form.id)return;
    event.preventDefault();
    const values=Object.fromEntries(new FormData(form));
    switch(form.id){
      case 'intake-form':
        state.intake=values;save();go('upload');break;
      case 'schedule-form': {
        if(!slot(values.slot))return;
        state.slot=values.slot;state.draft={...state.draft,topic:values.topic};save();
        const check=form.querySelector('#check-time');
        check.disabled=true;check.textContent='Checking…';
        form.querySelector('#availability-status').textContent='Checking appointment availability.';
        setTimeout(()=>{if(!form.isConnected)return;const available=slot(values.slot).available;if(!available){state.tried=true;save();}go(available?'review':'unavailable');},950);
        break;
      }
      case 'progress-form':
        state.entries.push({date:new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',timeZone:'Asia/Karachi'}).format(new Date()),weight:Number(values.weight),symptom:values.symptom});
        save();render();toast('Weekly check-in saved.');break;
      case 'reminder-form':
        state.reminders=Boolean(values.reminders);save();toast('Reminder preference saved.');break;
      case 'safety-form':
        state.meds=true;save();render();toast('Sample recommendation shared with the patient.');break;
      case 'meal-form':
        state.plan=[values.meal0,values.meal1,values.meal2];state.planNote=values.note;save();render();toast('Meal plan published to the patient workspace.');break;
    }
  }, { signal });
  window.addEventListener('hashchange',()=>{render();window.scrollTo(0,0);main.focus({preventScroll:true});}, { signal });
  render();
  return () => {
    listeners.abort();
    clearTimeout(toast.timer);
  };
}
