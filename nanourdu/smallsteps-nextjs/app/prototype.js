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
    day:0, slot:'', bookings:[], selectedBooking:null, draft:null,
    careDate:'2026-11-23', firstVisitDone:false, testRequest:'', report:'', decision:'pending',
    monthlyDue:'', reminders:true, member:false,
    entries:[{date:'Nov 7',weight:86.8,symptom:'None'},{date:'Nov 14',weight:86.3,symptom:'Low energy'},{date:'Nov 21',weight:85.9,symptom:'None'}],
    plan:['Yogurt, oats and banana','Chickpea and cucumber bowl','Lentil dal, roti and greens'],
    planNote:'Prep the chickpeas and chop the cucumber the evening before.'
  });
  const key = 'smallsteps-glp1-demo-v2';
  let state = fresh();
  try { state = {...state,...JSON.parse(localStorage.getItem(key))}; } catch {}
  const save = () => { try { localStorage.setItem(key,JSON.stringify(state)); } catch {} };
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const dateFormatter = new Intl.DateTimeFormat('en-US',{weekday:'short',month:'short',day:'numeric',timeZone:'UTC'});
  const dateLabel = iso => dateFormatter.format(new Date(iso+'T00:00:00Z'));
  function addDays(iso, days) {
    const date = new Date(iso+'T00:00:00Z');
    date.setUTCDate(date.getUTCDate()+days);
    return date.toISOString().slice(0,10);
  }
  function nextMonth(iso) {
    const date = new Date(iso+'T00:00:00Z');
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth()+1);
    const last = new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();
    date.setUTCDate(Math.min(day,last));
    return date.toISOString().slice(0,10);
  }
  const visits = {
    screening:{title:'First doctor consultation', doctor:'Dr. Rania Malik'},
    monthly:{title:'Required monthly doctor review', doctor:'Dr. Rania Malik'},
    questions:{title:'Optional visit for questions', doctor:'Dr. Noor Rahman'}
  };
  const allowed = type => type==='screening' ? !state.firstVisitDone
    : type==='monthly' ? state.decision==='eligible'
    : type==='questions' && state.firstVisitDone;
  const visitType = () => state.draft?.type || 'screening';
  const booked = type => state.bookings.find(b=>b.status==='Confirmed'&&b.type===type);
  const selectedBooking = () => state.bookings.find(b=>b.ref===state.selectedBooking);
  const recurring = () => booked('monthly');
  function calendar(type=visitType()) {
    const start = type==='monthly' ? state.monthlyDue : state.careDate;
    const hours = [['10:00 AM','12:30 PM','5:30 PM'],['9:30 AM','1:00 PM','4:00 PM'],['11:00 AM','2:30 PM','6:00 PM']];
    return hours.map((times,i)=>{
      const iso = addDays(start,i);
      return {iso,label:dateLabel(iso),slots:times.map((time,j)=>({
        id:`${i}-${j}`,time,iso,day:dateLabel(iso),index:i,
        booked:state.bookings.some(b=>b.status==='Confirmed'&&b.iso===iso&&b.time===time)
      }))};
    });
  }
  const slot = id => calendar().flatMap(d=>d.slots).find(s=>s.id===id);
  const available = option => Boolean(option&&!option.booked);

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

  const main = document.querySelector('main');
  const dialog = document.querySelector('dialog');
  const link = (label, route, secondary=false, symbol='') => `<a class="button${secondary?' secondary':''}" href="#${route}">${symbol?icon(symbol):''}${label}</a>`;
  const button = (label, action, secondary=false, symbol='') => `<button class="button${secondary?' secondary':''}" type="button" data-action="${action}">${symbol?icon(symbol):''}${label}</button>`;
  const back = (route, label='Back') => `<a class="back" href="#${route}">‹ ${label}</a>`;
  const heading = (tag,title,copy='') => `<div class="heading"><span class="overline">${tag}</span><h1>${title}</h1>${copy?`<p>${copy}</p>`:''}</div>`;
  const pill = (label, mode='done') => `<span class="pill ${mode}">${icon(mode==='done'?'check':mode==='wait'?'clock':'warning')}${label}</span>`;
  const field = (label, name, val, type='text', attrs='') => `<label class="field">${label}<input type="${type}" name="${name}" value="${esc(val)}" ${attrs}></label>`;
  const row = (sym,title,desc,extra='') => `<div class="row"><span class="icon-box">${icon(sym)}</span><div class="grow"><h3>${title}</h3><small>${desc}</small></div>${extra}</div>`;
  const toast = message => { const el=document.querySelector('#toast');el.textContent=message;clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.textContent='',4200); };
  const go = route => { if(location.hash===`#${route}`) render(); else location.hash=route; };
  const routeNames = {home:'Overview',care:'Consultations',schedule:'Book appointment',review:'Review booking',success:'Booking status',room:'Video room',summary:'Visit summary',nutrition:'Meal plan',medication:'Medication',progress:'Progress',labs:'Tests & reports',membership:'Membership',team:'Care team',doctor:'Doctor review',dietitian:'Meal plan builder',test:'Walkthrough guide'};
  const nav = [['home','home'],['care','calendar'],['medication','meds'],['nutrition','leaf'],['progress','chart'],['labs','lab'],['membership','wallet']];
  const teamNav = [['team','home'],['doctor','video'],['dietitian','leaf']];
  let activeRoute;
  const pages = {};

  function careStep() {
    const first = booked('screening');
    if(!state.firstVisitDone) return first
      ? ['Your first visit is booked','Open the booking to join the doctor consultation.',bookingButton(first)]
      : ['Start with a doctor consultation','Tell the doctor about your goals. They’ll explain which tests to take after the visit.',visitButton('screening','Book first consultation')];
    if(!state.testRequest) return ['Waiting for your doctor’s test request','Your doctor will list the tests you need after your first visit.',link('View visit summary','summary')];
    if(!state.report) return ['Your doctor requested tests','See the list before going to the lab. Attach your results when they’re ready.',link('View requested tests','labs')];
    if(state.decision==='pending') return ['Your doctor is reviewing your results','You’ll see the GLP-1 decision and any next steps in Medication.',link('View review status','medication')];
    if(state.decision==='not-eligible') return ['GLP-1 not recommended','Your doctor reviewed your results and recommends discussing other options.',link('View doctor’s decision','medication')];
    return ['Monthly doctor review','Book and attend a required video appointment every month while on GLP-1.',
      recurring()?bookingButton(recurring()):visitButton('monthly','Book monthly review')];
  }
  const visitButton = (type,label,secondary=false) => `<button type="button" class="button${secondary?' secondary':''}" data-visit="${type}">${label}</button>`;
  const bookingButton = (booking,label='View booking') => `<button type="button" class="button secondary" data-booking="${booking.ref}">${label}</button>`;

  pages.home = () => {
    const [title,copy,action]=careStep();
    return `${heading('GLP-1 TELEMEDICINE','Welcome, Amina','Your doctor visits, test results and follow-up plan in one place.')}
  <section class="hero"><div class="hero-photo" aria-hidden="true"></div><div class="hero-copy"><span class="overline">YOUR NEXT STEP</span>
  <h2>${title}</h2><p>${copy}</p>${action}</div></section>
  <div class="section-head"><h2>Your care at a glance</h2></div>
  <div class="grid three">
  <a class="card tile" href="#care"><span class="icon-box">${icon('calendar')}</span><h3>Consultations</h3><p>Book a visit or manage your appointments.</p></a>
  <a class="card tile" href="#labs"><span class="icon-box purple">${icon('lab')}</span><h3>Tests &amp; reports</h3><p>See the tests your doctor requests and attach results.</p></a>
  <a class="card tile" href="#progress"><span class="icon-box yellow">${icon('chart')}</span><h3>Weekly check-in</h3><p>Log your weight and how you feel.</p></a>
  </div><div class="group"><a class="text-link" href="#test">Walkthrough guide</a></div>`;
  };

  pages.care = () => {
    const active=state.bookings.filter(b=>b.status==='Confirmed');
    const monthlyCopy=state.monthlyDue
      ? `Due ${dateLabel(state.monthlyDue)}. This review is required every month while on GLP-1.`
      : 'Monthly reviews become available after your doctor recommends GLP-1.';
    return `${heading('YOUR CARE','Consultations','Choose the visit you need. All demo times are in Pakistan Standard Time.')}
  ${active.length?`<section class="card narrow list"><h2>Upcoming appointments</h2>${active.map(b=>row('check',visits[b.type].title,`${b.day} at ${b.time} · ${b.ref}`,bookingButton(b))).join('')}</section>`:''}
  <section class="card narrow stack list">
  ${row('video',visits.screening.title,'Start here. Your doctor will discuss your goals and tell you which tests to take.',
    state.firstVisitDone?link('View visit summary','summary',true):booked('screening')?'':visitButton('screening','Choose a time',true))}
  ${row('calendar',visits.monthly.title,monthlyCopy,
    state.decision==='eligible'&&!recurring()?visitButton('monthly','Book monthly review',true):'')}
  ${row('video',visits.questions.title,'Book an extra video visit to ask about your tests, treatment or anything else.',
    allowed('questions')?visitButton('questions','Book a visit for questions',true):'')}
  </section>`;
  };

  pages.schedule = () => {
    const type=visitType();
    if(!allowed(type))return `${back('care','Consultations')}${heading('YOUR CARE','Choose a visit','See which appointments you can book.')}${link('View consultations','care')}`;
    const days=calendar();
    return `${back('care','Consultations')}${heading('BOOK A VIDEO VISIT','Book an appointment','Choose from the available appointment times below.')}
  <form class="card narrow" id="schedule-form">
  ${row('video',visits[type].title,`${visits[type].doctor} · 15 min · PKT`)}
  <label class="field group">Reason for visit<input name="topic" required maxlength="120" value="${esc(state.draft?.topic||'')}"></label>
  <div class="tabbar" role="group" aria-label="Appointment date">${days.map((d,i)=>`<button type="button" data-day="${i}" aria-pressed="${i===state.day}">${d.label}</button>`).join('')}</div>
  <fieldset><legend>Appointment time</legend>
  ${days[state.day].slots.filter(available).map(option=>`<label class="option"><input type="radio" name="slot" value="${option.id}" required ${state.slot===option.id?'checked':''}><span>${option.time}</span></label>`).join('')}</fieldset>
  <div class="actions"><button class="button">Continue ${icon('arrow')}</button></div></form>`;
  };
  pages.review = () => {
    const type=visitType();
    if(!allowed(type))return pages.schedule();
    const chosen=slot(state.slot);
    if(!available(chosen)) return `${heading('BOOK A VIDEO VISIT','Review booking','Choose an available time to continue.')}${link('Choose a time','schedule')}`;
    return `${back('schedule','Appointment times')}${heading('BOOK A VIDEO VISIT','Review your booking','Check your appointment details before confirming.')}
  <section class="card narrow list">
  ${row('video',visits[type].title,`${visits[type].doctor} · 15-minute video visit`)}
  ${row('calendar',`${chosen.day} at ${chosen.time}`,'Pakistan Standard Time (PKT)')}
  ${row('leaf','Reason for visit',esc(state.draft?.topic))}
  <div class="actions">${button('Confirm booking','confirm',false,'check')}${link('Change time','schedule',true)}</div></section>`;
  };
  pages.success = () => {
    const booking=selectedBooking();
    if(!booking) return `${back('care','Consultations')}${heading('YOUR CARE','Appointment status','Your confirmed visit will appear here.')}${link('View consultations','care')}`;
    return `${back('care','Consultations')}${heading('APPOINTMENT STATUS',`Visit ${booking.status.toLowerCase()}`)}
  <div class="card narrow list">${row('calendar',`${booking.day} at ${booking.time} PKT`,`${visits[booking.type].title} · ${visits[booking.type].doctor}`,pill(booking.status,booking.status==='Cancelled'?'error':'done'))}
  ${row('check',booking.ref,'Booking reference')}
  ${row('leaf','Reason for visit',esc(booking.topic))}
  <div class="actions">${booking.status==='Confirmed'?link('Open video room','room',false,'video'):''}
  ${booking.status==='Confirmed'?button(booking.type==='monthly'?'Reschedule monthly review':'Cancel booking','cancel-booking',true):''}
  <a class="text-link" href="#care">Return to consultations</a></div></div>`;
  };
  pages.room = () => {
    const booking=selectedBooking();
    return `${back('success','Appointment')}${heading('VIDEO CONSULTATION','Video visit','Try the waiting room and finish a demo consultation.')}
  ${booking?.status==='Confirmed'?`<div class="card narrow"><div class="room"><div><div class="initials">${booking.type==='questions'?'NR':'RM'}</div><h3>${visits[booking.type].doctor}</h3><p>${booking.joined?'Demo visit in progress':'Ready to join the demo waiting room'}</p></div></div><div class="actions">${booking.joined?button('Finish demo visit','finish',false,'check'):button('Join demo visit','join',false,'video')}${link('Back to appointment','success',true)}</div></div>`:link('Find a consultation','care')}`;
  };
  pages.summary = () => {
    const booking=selectedBooking();
    const [title,copy,action]=careStep();
    return `${back('care','Consultations')}${heading('YOUR CARE','Visit summary','See what happens next.')}
  <section class="card narrow list">
  ${booking?.status==='Completed'?row('video',visits[booking.type].title,'Demo visit completed',pill('Completed')):''}
  ${row('lab',title,copy,state.firstVisitDone&&!state.testRequest?'':action)}
  ${state.firstVisitDone?row('video','Questions for your doctor','Book an extra visit whenever you need to talk.',visitButton('questions','Book a visit for questions',true)):''}
  ${state.decision==='eligible'?row('meds','Your medication plan','See the dose and follow-up note from your doctor.',link('View medication','medication',true)):''}
  </section>`;
  };

  pages.medication = () => {
    const intro=`${back('home','Overview')}${heading('GLP-1 TREATMENT','Medication recommendation','Your doctor decides whether GLP-1 is appropriate after reviewing your test results.')}`;
    if(state.decision!=='eligible'){
      const [title,copy,action]=careStep();
      return `${intro}<section class="card narrow">${row('meds',title,copy,(!state.report&&state.testRequest)||!state.firstVisitDone?action:'')}
  ${state.decision==='not-eligible'?`<div class="actions">${visitButton('questions','Book a visit for questions')}</div>`:''}</section>`;
    }
    return `${intro}<div class="grid">
    <section class="card dose-card" aria-labelledby="med-name">
      <div class="section-head"><span class="overline">DOCTOR RECOMMENDATION</span>${pill('GLP-1 recommended in demo')}</div>
      <h2 id="med-name">${recommendation.drug}</h2>
      <p class="muted">${recommendation.formulation}</p>
      <div class="dose-display"><strong>${recommendation.dose}</strong><span>mg</span></div>
      <dl class="dose-details"><div><dt>Frequency</dt><dd>${recommendation.schedule}</dd></div><div><dt>Duration</dt><dd>${recommendation.duration}</dd></div><div><dt>Route</dt><dd>${recommendation.route}</dd></div></dl>
    </section>
    <section class="card">
      ${row('video',visits.screening.doctor,'Recommending doctor · Fictional profile')}
      <div class="callout"><h3>Required monthly doctor review</h3><p>Next review due ${dateLabel(state.monthlyDue)}. ${recommendation.note}</p></div>
      <p class="muted">Fictional example for the prototype. Use your own doctor’s instructions for actual treatment.</p>
      <div class="actions">${recurring()?bookingButton(recurring(),'View monthly booking'):visitButton('monthly','Book monthly review')}
      ${visitButton('questions','Book a visit for questions',true)}</div>
      <a class="text-link" href="${recommendation.source}" target="_blank" rel="noopener noreferrer">Sample dose reference (FDA)</a>
    </section>
  </div>`;
  };

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
  pages.labs = () => `${back('home','Overview')}${heading('YOUR RECORDS','Tests &amp; reports','Your doctor tells you which tests to take after your first consultation.')}
  <section class="card narrow">
  ${state.testRequest?row('lab','Tests requested by your doctor',esc(state.testRequest)):row('lab','No tests requested yet','Start with a doctor consultation. Once the doctor requests tests, the list and upload options will appear here.')}
  ${state.testRequest?`
    <div class="group">${row('lab',esc(state.report||'No report attached'),state.report?'Available for your doctor to review':'Attach your results after you get them from the lab.',state.report?pill('Attached'):'')}</div>
    ${state.decision==='pending'?`<div class="actions">${button('Attach sample report','sample-report',true)}${button('Choose a demo file','upload-file',true)}<input id="demo-file" type="file" accept=".pdf,.jpg,.jpeg,.png" hidden></div>
    <p class="muted group">The demo stores the filename only.</p>`:`<div class="actions">${link('View doctor’s decision','medication')}</div>`}
  `:state.firstVisitDone?link('View visit summary','summary',true):link('View consultations','care',true)}
  </section>`;

  pages.membership = () => `${back('home','Overview')}${heading('YOUR ACCOUNT','Membership','Review the monthly fee and choose a reminder preference.')}
  <div class="grid"><section class="card"><span class="overline">MONTHLY CARE PLAN</span><div class="price">PKR 7,500 <small>/ month</small></div>
  <ul class="checklist"><li>First video consultation and required monthly doctor reviews on GLP-1</li><li>Weekly self check-in and dietitian planning</li><li>Medication and lab fees billed separately</li></ul>
  <p class="muted">Illustrative pricing for this prototype.</p>
  <div class="actions">${state.member?pill('Demo plan active'):button('Activate demo plan','activate')}</div></section>
  <form class="card" id="reminder-form"><h3>Appointment reminders</h3><p>Try the SMS reminder preference for upcoming visits.</p>
  <label class="option"><input type="checkbox" name="reminders" ${state.reminders?'checked':''}> SMS reminders</label>
  <div class="actions"><button class="button">Save preference</button></div></form></div>`;

  pages.team = () => `${back('home','Patient workspace')}${heading('CARE TEAM WORKSPACE','Amina Khan','Review this sample patient’s visit and publish her weekly meal plan.')}
  <div class="grid"><a class="card tile" href="#doctor"><span class="icon-box">${icon('video')}</span><h3>Doctor review</h3><p>Request tests after the first visit and record a decision after reviewing the results.</p></a><a class="card tile" href="#dietitian"><span class="icon-box purple">${icon('leaf')}</span><h3>Dietitian workspace</h3><p>Update three meal ideas and publish them to the patient view.</p></a></div>`;
  pages.doctor = () => {
    const intro=`${back('team','Care team')}${heading('CARE TEAM WORKSPACE','Doctor review','Request tests after the first visit and record a GLP-1 decision after reviewing the results.')}`;
    if(!state.firstVisitDone)return `${intro}<section class="card narrow">${row('video','First consultation pending','Complete the first video consultation before requesting tests.')}</section>`;
    if(!state.testRequest)return `${intro}<form class="card narrow" id="test-request-form">
      <h3>Request tests</h3><p>Tell Amina which tests to take. Use the example test request or enter sample names.</p>
      <label class="field group">Tests to take<textarea name="tests" required maxlength="240" rows="3">HbA1c blood test and kidney function blood test (fictional example)</textarea></label>
      <button class="button">Send test request</button></form>`;
    const report=`<section class="card narrow list">${row('lab','Tests requested',esc(state.testRequest))}${row('lab','Report',esc(state.report||'Waiting for results'))}</section>`;
    if(!state.report)return `${intro}${report}<div class="actions">${link('View patient tests page','labs',true)}</div>`;
    if(state.decision!=='pending')return `${intro}${report}<section class="card narrow stack">${row('check','Decision shared',state.decision==='eligible'?'GLP-1 recommended in this demo.':'GLP-1 not recommended in this demo.',link('View patient decision','medication',true))}</section>`;
    return `${intro}${report}<form class="card narrow stack" id="decision-form"><h3>GLP-1 decision</h3>
    <p>Record the doctor’s judgment in this fictional case.</p>
    <label class="option"><input name="reviewed" type="checkbox" required>I reviewed the requested results and the patient’s history.</label>
    <fieldset><legend>Doctor’s decision</legend>
      <label class="option"><input name="decision" type="radio" value="eligible" required>Recommend GLP-1 in this demo</label>
      <label class="option"><input name="decision" type="radio" value="not-eligible" required>GLP-1 is not recommended</label>
    </fieldset>
    <div class="actions"><button class="button">Share decision with patient</button></div></form>`;
  };

  pages.dietitian = () => `${back('team','Care team')}${heading('CARE TEAM WORKSPACE','Meal plan builder','Edit this week’s meal suggestions for Amina and publish the updates.')}
  <form class="card narrow" id="meal-form">${state.plan.map((m,i)=>field(['Breakfast','Lunch','Dinner'][i],`meal${i}`,m,'text','required maxlength="100"')).join('')}
  <label class="field">Prep note<textarea name="note" rows="2" maxlength="240" required>${esc(state.planNote)}</textarea></label>
  <div class="actions"><button class="button">Publish weekly plan</button>${link('View patient meal plan','nutrition',true)}</div></form>`;

  pages.test = () => `${back('home','Overview')}${heading('WALKTHROUGH GUIDE','Try the prototype','Begin with Reset demo. Use the patient and care team views to complete these tasks.')}
  <div class="card narrow list">
  ${row('calendar','Book the first visit','Choose a date and one of the available times, review the details, then confirm and finish the demo call.')}
  ${row('lab','Request tests and attach the report','In Doctor review, send the test request. Open the patient’s Tests &amp; reports page, read the request and attach the sample result.')}
  ${row('meds','Share a decision','Return to Doctor review, confirm you reviewed the sample result, and record the GLP-1 decision. Only a recommendation opens the medication dose.')}
  ${row('video','Try both follow-up types','Book the required monthly review and a separate optional visit for questions. Complete the monthly review to see the next one become due.')}
  <div class="actions">${link('View consultations','care',false,'arrow')}</div></div>`;

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
  function beginVisit(type) {
    state.draft={type,topic:type==='screening'?'Discuss whether GLP-1 could be right for me':type==='monthly'?'Monthly treatment and progress review':''};
    state.day=0;
    state.slot='';
    save();
    go('schedule');
  }
  function attachReport(filename) {
    if(!state.firstVisitDone||!state.testRequest||state.decision!=='pending')return;
    state.report=filename;
    save();
    render();
    toast('Report ready for doctor review.');
  }
  const actions = {
    reset:()=>confirmDialog('Reset this demo?','This clears the prototype changes in this browser.','Reset demo','reset-confirm'),
    'reset-confirm':()=>{dialog.close();state=fresh();save();go('home');toast('Demo reset.');},
    'sample-report':()=>attachReport('Requested test results (sample).pdf'),
    'upload-file':()=>document.querySelector('#demo-file')?.click(),
    confirm:()=>{
      const type=visitType();
      if(!allowed(type))return;
      const chosen=slot(state.slot);
      if(!available(chosen))return;
      const current=type!=='questions'&&booked(type);
      if(current&&state.draft?.replaceRef!==current.ref){
        state.selectedBooking=current.ref;save();go('success');return;
      }
      if(current)current.status='Rescheduled';
      const suffix=crypto.randomUUID().slice(0,8).toUpperCase();
      const ref=`SS-${chosen.iso.replaceAll('-','')}-${suffix}`;
      state.bookings.push({...chosen,type,topic:state.draft.topic,ref,status:'Confirmed'});
      state.selectedBooking=ref;
      save();go('success');
    },
    'cancel-booking':()=>{
      const booking=selectedBooking();
      if(booking?.status!=='Confirmed')return;
      if(booking.type==='monthly'){
        confirmDialog('Choose a new time','Your current monthly appointment stays booked until you confirm another time.','Choose another time','monthly-reschedule');
      }else confirmDialog('Cancel this appointment?','Your appointment will be marked cancelled.','Cancel appointment','cancel-confirm');
    },
    'monthly-reschedule':()=>{
      dialog.close();
      const booking=selectedBooking();
      if(booking?.status==='Confirmed'&&booking.type==='monthly'){
        state.draft={type:'monthly',topic:booking.topic,replaceRef:booking.ref};
        state.day=0;state.slot='';save();go('schedule');
      }
    },
    'cancel-confirm':()=>{
      dialog.close();
      const booking=selectedBooking();
      if(booking?.status!=='Confirmed'||booking.type==='monthly')return;
      booking.status='Cancelled';save();render();toast('Appointment cancelled.');
    },
    join:()=>{
      const booking=selectedBooking();
      if(booking?.status==='Confirmed'){booking.joined=true;save();render();}
    },
    finish:()=>{
      const booking=selectedBooking();
      if(booking?.status!=='Confirmed'||!booking.joined)return;
      booking.status='Completed';
      if(booking.type==='screening'){
        state.firstVisitDone=true;
        state.careDate=booking.iso;
      }else if(booking.type==='monthly'){
        state.careDate=booking.iso;
        state.monthlyDue=nextMonth(booking.iso);
      }
      save();go('summary');
    },
    activate:()=>{state.member=true;save();render();toast('Demo membership activated.');}
  };
  document.addEventListener('click',event=>{
    const button=event.target.closest('button');
    if(!button)return;
    if(button.dataset.action)actions[button.dataset.action]?.();
    if(button.dataset.day!==undefined){
      state.draft={...state.draft,type:visitType(),topic:document.querySelector('#schedule-form [name="topic"]').value};
      state.day=Number(button.dataset.day);state.slot='';save();render();
      document.querySelector(`[data-day="${state.day}"]`)?.focus();
    }
    if(button.dataset.visit&&allowed(button.dataset.visit))beginVisit(button.dataset.visit);
    if(button.dataset.booking){
      state.selectedBooking=button.dataset.booking;save();go('success');
    }
  }, { signal });
  document.addEventListener('change',event=>{
    if(event.target.id!=='demo-file'||!event.target.files.length)return;
    const file=event.target.files[0];
    if(!/\.(pdf|png|jpe?g)$/i.test(file.name)){toast('Choose a PDF, PNG or JPG demo file.');return;}
    attachReport(file.name);
  }, { signal });

  document.addEventListener('submit',event=>{
    const form=event.target;
    if(!form.id)return;
    event.preventDefault();
    const values=Object.fromEntries(new FormData(form));
    switch(form.id){
      case 'schedule-form': {
        if(!allowed(visitType())||!slot(values.slot)||!values.topic.trim())return;
        state.slot=values.slot;state.draft={...state.draft,topic:values.topic};save();
        if(!available(slot(values.slot)))return;
        go('review');
        break;
      }
      case 'progress-form':
        state.entries.push({date:new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',timeZone:'Asia/Karachi'}).format(new Date()),weight:Number(values.weight),symptom:values.symptom});
        save();render();toast('Weekly check-in saved.');break;
      case 'reminder-form':
        state.reminders=Boolean(values.reminders);save();toast('Reminder preference saved.');break;
      case 'test-request-form':
        if(!state.firstVisitDone||state.testRequest||!values.tests.trim())return;
        state.testRequest=values.tests.trim();save();render();toast('Test request sent to the patient.');break;
      case 'decision-form':
        if(!state.firstVisitDone||!state.testRequest||!state.report||state.decision!=='pending'||!values.reviewed)return;
        if(!['eligible','not-eligible'].includes(values.decision))return;
        state.decision=values.decision;
        if(state.decision==='eligible')state.monthlyDue=nextMonth(state.careDate);
        save();render();toast('Decision shared with the patient.');break;
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
