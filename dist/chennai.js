const $ = id => document.getElementById(id);
const STORE = 'fobus-chennai-demo-v1', SESSION = 'fobus-session-v1';
const ADMIN_EMAIL = 'iamanishfellass@gmail.com';
const ADMIN_HASH = '054eff6ef923797ac42d1ea652d4d204fef31a08b449a43c74e58047a0e091e6';
const stops = {
  'Chennai Central':[13.0827,80.2707], Egmore:[13.0732,80.2609], 'T Nagar':[13.0418,80.2341], Guindy:[13.0067,80.2206], Adyar:[13.0067,80.2576], Mylapore:[13.0339,80.2687], 'Marina Beach':[13.05,80.2824], 'Anna Nagar':[13.085,80.2101], Koyambedu:[13.0694,80.1948], Velachery:[12.9825,80.2209], Tambaram:[12.9249,80.1], Airport:[12.9941,80.1709]
};
const routes = [
  ['Chennai Central','Egmore','T Nagar','Guindy'],
  ['Chennai Central','Marina Beach','Mylapore','Adyar'],
  ['Anna Nagar','Koyambedu','T Nagar','Guindy'],
  ['Guindy','Velachery','Adyar','Mylapore'],
  ['Airport','Guindy','T Nagar','Egmore'],
  ['Tambaram','Airport','Guindy','Velachery']
];
const initialBuses = [
  {id:'21G',type:'Non-AC',route:0,passengers:27,capacity:50,pace:38,phase:.3},
  {id:'A1',type:'AC',route:1,passengers:19,capacity:42,pace:43,phase:1.2},
  {id:'27C',type:'Non-AC',route:2,passengers:50,capacity:50,pace:46,phase:2.1},
  {id:'M70',type:'Non-AC',route:3,passengers:22,capacity:50,pace:40,phase:.8},
  {id:'AC-5',type:'AC',route:4,passengers:31,capacity:42,pace:48,phase:1.7},
  {id:'70V',type:'Non-AC',route:5,passengers:41,capacity:50,pace:53,phase:2.8}
];
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
const fare = bus => bus.type === 'AC' ? 40 : 20;
const routeFor = bus => routes[bus.route] || routes[0];
let state, session, map, markers = [], routeLine, selectedBus = null, filter = 'all', lastArrivalRender = 0;
async function hashPassword(password) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2,'0')).join('');
}
function save() { localStorage.setItem(STORE, JSON.stringify(state)); }
function normalizeBus(bus) {
  const capacity = Math.max(1, Math.floor(Number(bus.capacity) || 1));
  const passengers = Math.max(0, Math.min(capacity, Math.floor(Number(bus.passengers) || 0)));
  const validSeats = Array.isArray(bus.seats) && bus.seats.length === capacity && bus.seats.every(value => typeof value === 'boolean');
  const changed = bus.capacity !== capacity || bus.passengers !== (validSeats ? bus.seats.filter(Boolean).length : passengers) || !validSeats || typeof bus.ticketSalesPaused !== 'boolean';
  bus.capacity = capacity;
  if (!validSeats) bus.seats = Array.from({length:capacity}, (_, index) => index < passengers);
  bus.passengers = bus.seats.filter(Boolean).length;
  bus.ticketSalesPaused = bus.ticketSalesPaused === true;
  return changed;
}
function crowdStatus(bus) {
  const ratio = bus.passengers / bus.capacity;
  return ratio >= 1 ? 'Full' : ratio >= .8 ? 'Crowded' : 'Room available';
}
function salesBlocked(bus) { return bus.ticketSalesPaused === true; }
function toggleSeat(busId, index) {
  const account = current(), bus = state.buses.find(item => item.id === busId);
  if (session?.role !== 'conductor' || account?.busId !== busId || !bus || !Number.isInteger(index) || index < 0 || index >= bus.capacity) return false;
  normalizeBus(bus);
  bus.seats[index] = !bus.seats[index];
  bus.passengers = bus.seats.filter(Boolean).length;
  save();
  return true;
}
function current() { return state.accounts.find(a => a.email === session?.email && a.role === session?.role); }
function findLoginAccount(email, role) {
  return state.accounts.find(a => a.email === email && (role === 'conductor' ? a.role === 'conductor' : a.role === 'user' || a.role === 'admin'));
}
function synchronizeAdminAccount() {
  const admins = state.accounts.filter(a => a.role === 'admin');
  if (admins.length === 1 && admins[0].email === ADMIN_EMAIL && admins[0].password === ADMIN_HASH && state.accounts.filter(a => a.email === ADMIN_EMAIL).length === 1) return false;
  state.accounts = state.accounts.filter(a => a.role !== 'admin' && a.email !== ADMIN_EMAIL);
  state.accounts.push({name:'Fobus Admin',email:ADMIN_EMAIL,password:ADMIN_HASH,role:'admin'});
  return true;
}
function ensureDemo27C() {
  let changed = false;
  let bus = state.buses.find(item => item.id === '27C');
  if (!bus && !state.demo27CReady) {
    bus = {...initialBuses.find(item => item.id === '27C')};
    state.buses.push(bus);
    changed = true;
  }
  if (bus && !state.demo27CReady) {
    bus.passengers = bus.capacity;
    bus.seats = Array.from({length:bus.capacity}, () => true);
    state.demo27CReady = true;
    changed = true;
  }
  if (bus && !state.accounts.some(a => a.email === 'cond27c@gmail.com')) {
    state.accounts.push({name:'27C Conductor',email:'cond27c@gmail.com',password:'df1a07fe769378ad48cb110208ddd4657f06a708e960f1749cde02d9e703f898',role:'conductor',busId:'27C'});
    changed = true;
  }
  return changed;
}
function signIn(account) { session = {email:account.email,role:account.role}; sessionStorage.setItem(SESSION,JSON.stringify(session)); selectedBus = null; render(); }
function signOut() { session = null; sessionStorage.removeItem(SESSION); selectedBus = null; render(); }
function toast(message) { const box = $('toast'); box.textContent = message; box.hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => box.hidden = true, 4500); }
function progress(bus) { return (Date.now() - state.started) / (bus.pace * 1000) + bus.phase; }
function nextProgressForStop(bus, stop, after = progress(bus)) {
  const route = routeFor(bus), index = route.indexOf(stop);
  if (index < 0) return null;
  let target = Math.floor(after / route.length) * route.length + index;
  if (target <= after) target += route.length;
  return target;
}
function etaText(bus, target) {
  if (target == null) return 'Unavailable';
  const seconds = Math.max(0, (target - progress(bus)) * bus.pace);
  return seconds < 60 ? 'Due soon' : `${Math.ceil(seconds / 60)} min`;
}
function arrivalTime(bus, target) {
  return new Date(Date.now() + Math.max(0, (target - progress(bus)) * bus.pace * 1000)).toLocaleTimeString('en-IN',{hour:'numeric',minute:'2-digit'});
}
function upcomingStops(bus) {
  const route = routeFor(bus), p = progress(bus), first = Math.floor(p) + 1;
  return Array.from({length:route.length}, (_, offset) => ({name:route[(first + offset) % route.length],target:first + offset}));
}
function position(bus) {
  const route = routeFor(bus), p = progress(bus), i = Math.floor(p) % route.length, fraction = p % 1;
  const a = stops[route[i]], b = stops[route[(i+1)%route.length]];
  return [a[0]+(b[0]-a[0])*fraction,a[1]+(b[1]-a[1])*fraction];
}
function nextStop(bus) { const r = routeFor(bus); return r[(Math.floor(progress(bus))+1)%r.length]; }
function expireTickets() {
  let changed = false;
  for (const ticket of state.tickets) {
    const bus = state.buses.find(b => b.id === ticket.busId);
    if (ticket.status === 'active' && (!bus || progress(bus) >= ticket.expiresAtProgress)) {
      ticket.status = 'past'; ticket.endedAt = Date.now(); changed = true;
    }
  }
  if (changed) save();
  return changed;
}
function tick() {
  if (!state) return;
  const changed = expireTickets();
  if (!session) return;
  if (map) updateMapMarkers();
  if (session.role === 'user') {
    renderTickets();
    if (Date.now() - lastArrivalRender >= 5000) renderArrivalsBoard();
    document.querySelectorAll('[data-next-stop]').forEach(el => { const b = state.buses.find(bus => bus.id === el.dataset.nextStop); if (b) el.textContent = nextStop(b); });
    if (changed) toast('Your bus reached your stop. The ticket moved to Past tickets.');
  }
  if (session.role === 'conductor') {
    const bus = state.buses.find(item => item.id === current()?.busId);
    if ($('conductor-next') && bus) $('conductor-next').textContent = nextStop(bus);
    if (changed) renderConductorStats();
  }
}
async function initialize() {
  try { state = JSON.parse(localStorage.getItem(STORE)); } catch { state = null; }
  let needsSave = false;
  if (!state || !Array.isArray(state.buses) || !Array.isArray(state.accounts)) {
    state = {started:Date.now(),buses:initialBuses,tickets:[],requests:[],accounts:[
      {name:'Haffiz',email:'haffiz@gmail.com',password:'df1a07fe769378ad48cb110208ddd4657f06a708e960f1749cde02d9e703f898',role:'user'},
      {name:'Conductor',email:'cond@gmail.com',password:'df1a07fe769378ad48cb110208ddd4657f06a708e960f1749cde02d9e703f898',role:'conductor',busId:'21G'},
      {name:'Fobus Admin',email:ADMIN_EMAIL,password:ADMIN_HASH,role:'admin'}
    ]}; needsSave = true;
  }
  if (synchronizeAdminAccount()) needsSave = true;
  const demoConductor = state.accounts.find(a => a.email === 'cond@gmail.com' && a.role === 'conductor');
  if (demoConductor?.password === '4094ae45fa464c3f2b5d695bab4f74da1770ce73e6fae17755d52a558cb8a510') {
    demoConductor.password = 'df1a07fe769378ad48cb110208ddd4657f06a708e960f1749cde02d9e703f898';
    needsSave = true;
  }
  if (ensureDemo27C()) needsSave = true;
  for (const bus of state.buses) if (normalizeBus(bus)) needsSave = true;
  if (needsSave) save();
  try { session = JSON.parse(sessionStorage.getItem(SESSION)); } catch { session = null; }
  if (session && !current()) session = null;
  expireTickets(); render(); setInterval(tick,1000);
  window.addEventListener('storage', e => { if (e.key === STORE) { try { state = JSON.parse(e.newValue); render(); } catch {} } });
}
function layout(content) {
  const account = current();
  $('app').innerHTML = `<div class="site-shell"><header class="topbar"><div class="brand"><span class="brand-mark">F</span><span>Fobus</span></div>${account ? `<nav class="main-nav"><span class="role-pill">${esc(account.role)}</span><span class="account-name">${esc(account.name)}</span><button class="link-button" id="signout">Sign out</button></nav>` : '<span class="top-note">Chennai transit</span>'}</header>${content}<footer class="site-footer">Fobus · Chennai</footer></div>`;
  if (account) $('signout').onclick = signOut;
}
function render() {
  closeModal();
  if (map) { map.remove(); map = null; markers = []; routeLine = null; }
  if (!session) return renderAuth();
  if (session.role === 'admin') renderAdmin();
  else if (session.role === 'conductor') renderConductor();
  else renderUser();
}
function renderAuth(mode='login',role='user') {
  const register = mode === 'register';
  layout(`<main class="auth-layout">
    <section class="auth-story"><span class="eyebrow">FOBUS · CHENNAI</span><h1>Make every ride<br><em>feel easy.</em></h1><p>Find a bus in Chennai, see where it is heading and keep your tickets in one place.</p></section>
    <section class="auth-card"><div class="auth-heading"><span class="eyebrow">WELCOME TO FOBUS</span><h2>${register ? role === 'conductor' ? 'Conductor request' : 'Create your account' : 'Sign in'}</h2><p>${register && role === 'conductor' ? 'An admin must approve your request before you can sign in.' : 'Choose how you use Fobus.'}</p></div>
    <div class="role-tabs" role="group" aria-label="Account type"><button data-role="user" class="${role==='user'?'active':''}">Passenger</button><button data-role="conductor" class="${role==='conductor'?'active':''}">Conductor</button></div>
    <form id="auth-form" class="form-grid">${register ? '<label>Full name<input name="name" required autocomplete="name" placeholder="Your name"></label>' : ''}<label>Email address<input name="email" type="email" required autocomplete="email" placeholder="name@gmail.com"></label>${register && role === 'conductor' ? `<div class="field-row"><label>Phone number<input name="phone" type="tel" pattern="[0-9]{10}" title="Enter a 10 digit phone number" required placeholder="10 digits"></label><label>Staff ID<input name="staffId" required placeholder="Your staff ID"></label></div><label>Depot<input name="depot" required placeholder="Depot name"></label><label>Bus you conduct<select name="busId" required>${state.buses.map(b => `<option value="${esc(b.id)}">${esc(b.id)} · ${esc(routeFor(b)[0])} to ${esc(routeFor(b).at(-1))}</option>`).join('')}</select></label>` : ''}<label>${register ? 'Create a password' : 'Password'}<input name="password" type="password" required minlength="8" autocomplete="${register?'new-password':'current-password'}" placeholder="At least 8 characters"></label>${register ? '<label>Repeat password<input name="repeat" type="password" required minlength="8" autocomplete="new-password" placeholder="Repeat your password"></label>' : ''}<p id="auth-error" class="form-error" role="alert" hidden></p><button class="primary wide" type="submit">${register ? role==='conductor'?'Send request to admin':'Create account':'Sign in'} <span>→</span></button></form>
    <p class="form-switch">${register?'Already have an account?':'New to Fobus?'} <button id="switch-mode" class="text-button">${register?'Sign in':role==='conductor'?'Register as conductor':'Sign up'}</button></p>
    </section></main>`);
  document.querySelectorAll('[data-role]').forEach(b => b.onclick = () => renderAuth(mode,b.dataset.role));
  if ($('switch-mode')) $('switch-mode').onclick = () => renderAuth(register?'login':'register',role);
  $('auth-form').onsubmit = async e => {
    e.preventDefault();
    const form = new FormData(e.currentTarget), email = String(form.get('email')).trim().toLowerCase(), password = String(form.get('password'));
    const error = $('auth-error'); error.hidden = true;
    const fail = message => { error.textContent = message; error.hidden = false; };
    if (register) {
      if (!email.endsWith('@gmail.com')) return fail('Please enter a Gmail address.');
      if (password !== form.get('repeat')) return fail('The passwords do not match.');
      if (state.accounts.some(a => a.email === email) || state.requests.some(r => r.email === email && r.status === 'pending')) return fail('This email already has an account or a pending request.');
      const base = {name:String(form.get('name')).trim(),email,password:await hashPassword(password)};
      if (role === 'conductor') {
        state.requests.push({...base,id:uid(),phone:String(form.get('phone')).trim(),staffId:String(form.get('staffId')).trim(),depot:String(form.get('depot')).trim(),busId:String(form.get('busId')),status:'pending',createdAt:Date.now()});
        save(); renderAuth('login','conductor'); toast('Request sent. An admin must approve it before you can sign in.');
      } else { state.accounts.push({...base,role:'user'}); save(); signIn(state.accounts.at(-1)); }
    } else {
      const account = findLoginAccount(email,role);
      if (!account || account.password !== await hashPassword(password)) return fail(role==='conductor' && state.requests.some(r => r.email===email && r.status==='pending') ? 'Your request is awaiting admin approval.' : 'Email or password is incorrect.');
      signIn(account);
    }
  };
}
function busCard(bus) {
  const fill = Math.round(bus.passengers/bus.capacity*100);
  return `<button class="bus-card ${selectedBus===bus.id?'selected':''}" data-select-bus="${esc(bus.id)}"><span class="bus-card-main"><span class="bus-number">${esc(bus.id)}</span><span class="bus-type">${bus.type}</span></span><span class="bus-route">${esc(routeFor(bus)[0])} <span>→</span> ${esc(routeFor(bus).at(-1))}</span><span class="bus-card-bottom"><span><b>${bus.passengers}</b> / ${bus.capacity} passengers</span><span class="fare">₹${fare(bus)}</span></span><span class="occupancy-track"><span style="width:${fill}%;background:${fill>84?'#d97869':fill>65?'#d6a451':'#3d9c80'}"></span></span></button>`;
}
function renderUser() {
  const account = current();
  layout(`<main class="dashboard"><div class="page-intro"><div><span class="eyebrow">PASSENGER DASHBOARD</span><h1>Good to see you, ${esc(account.name.split(' ')[0])}.</h1><p>Find a Chennai bus and manage your tickets.</p></div></div><div class="dashboard-grid"><aside class="tickets-panel"><div class="panel-title"><span class="panel-icon">▤</span><div><h2>My tickets</h2><p>Your rides at a glance</p></div></div><h3>Active ticket <span id="active-count">0</span></h3><div id="active-tickets"></div><h3 class="past-title">Past tickets <span id="past-count">0</span></h3><div id="past-tickets"></div><div class="ticket-hint">Tickets move to Past when the bus reaches your selected drop stop.</div></aside><section class="map-section"><div class="section-top"><div><span class="eyebrow">EXPLORE CHENNAI</span><h2>Buses near you <span class="count-badge" id="bus-count"></span></h2></div><span class="map-caption">Tap a marker or a bus below</span></div><div class="map-wrap"><div id="map" aria-label="Map of buses in Chennai"></div><span class="map-overlay">◉ &nbsp; Chennai</span><div id="map-fallback" class="map-fallback" hidden>Map could not load. You can still choose a bus below.</div></div><div class="map-footer"><span>Bus positions update on the map</span><span>OpenStreetMap map tiles</span></div><div class="section-top list-heading"><div><span class="eyebrow">PICK YOUR RIDE</span><h2>Available buses</h2></div><div class="filter-tabs" role="group" aria-label="Filter buses"><button data-filter="all" class="active">All</button><button data-filter="Non-AC">Non-AC</button><button data-filter="AC">AC</button></div></div><div id="bus-list" class="bus-list"></div></section></div></main>`);
  document.querySelector('.map-section').insertAdjacentHTML('afterbegin', '<section class="arrivals-surface" aria-label="Bus arrival estimates"><div class="arrivals-heading"><div><span class="eyebrow">CHENNAI ARRIVAL BOARD</span><h2>Upcoming buses <span class="count-badge" id="arrival-count"></span></h2><p>Next stop estimates for the whole fleet</p></div><span class="arrival-demo">● Demo estimates</span></div><div id="arrivals-board" class="arrivals-board"></div></section>');
  renderTickets(); renderArrivalsBoard(); renderBusList(); initMap();
  document.querySelectorAll('[data-filter]').forEach(b => b.onclick = () => { filter = b.dataset.filter; document.querySelectorAll('[data-filter]').forEach(x => x.classList.toggle('active',x===b)); renderBusList(); updateMapMarkers(); });
}
function renderArrivalsBoard() {
  const target = $('arrivals-board'); if (!target) return;
  lastArrivalRender = Date.now();
  $('arrival-count').textContent = `${state.buses.length} buses`;
  target.innerHTML = [...state.buses].sort((a,b) => {
    const nextA = upcomingStops(a)[0], nextB = upcomingStops(b)[0];
    return (nextA.target - progress(a)) * a.pace - (nextB.target - progress(b)) * b.pace;
  }).map(bus => {
    const upcoming = upcomingStops(bus)[0];
    const status = crowdStatus(bus).toLowerCase().replace(' ','-');
    const fill = Math.round(bus.passengers / bus.capacity * 100);
    return `<button class="arrival-card ${status}" style="--load:${fill}%" data-arrival-bus="${esc(bus.id)}" aria-label="Bus ${esc(bus.id)} arriving at ${esc(upcoming.name)} in ${etaText(bus,upcoming.target)}, ${esc(crowdStatus(bus))}"><span class="arrival-card-top"><span class="arrival-identity"><span class="arrival-bus-icon">↗</span><span><strong class="arrival-bus-id">${esc(bus.id)}</strong><small>${esc(bus.type)}</small></span></span><span class="arrival-clock"><small>ESTIMATED</small><b>${etaText(bus,upcoming.target)}</b><em>${arrivalTime(bus,upcoming.target)}</em></span></span><span class="arrival-route-line"><i></i><span>${esc(routeFor(bus)[0])}</span><b>→</b><span>${esc(routeFor(bus).at(-1))}</span></span><span class="arrival-stop"><small>NEXT STOP</small><strong>⌖ ${esc(upcoming.name)}</strong></span><span class="arrival-load"><span class="arrival-load-copy"><span class="arrival-status ${status}"><i></i>${esc(crowdStatus(bus))}</span><small>${bus.passengers}/${bus.capacity} passengers</small></span><span class="arrival-load-track"><i></i></span></span><span class="arrival-open">View bus <b>›</b></span></button>`;
  }).join('') || '<p class="empty-ticket">No buses are available.</p>';
  target.querySelectorAll('[data-arrival-bus]').forEach(button => button.onclick = () => openBus(button.dataset.arrivalBus));
}
function renderTickets() {
  if (!$('active-tickets')) return;
  const mine = state.tickets.filter(t => t.email===session.email), active = mine.filter(t => t.status==='active').reverse(), past = mine.filter(t => t.status==='past').reverse();
  $('active-count').textContent = active.length; $('past-count').textContent = past.length;
  const card = t => {
    const bus = state.buses.find(b => b.id === t.busId);
    const boarding = t.status === 'active' && bus && t.boardingAtProgress > progress(bus) ? `<div class="ticket-eta">Board at ${esc(t.from)}: ${etaText(bus,t.boardingAtProgress)} · ${arrivalTime(bus,t.boardingAtProgress)}</div>` : '';
    const drop = t.status === 'active' && bus ? `<div class="ticket-eta">Arrive at ${esc(t.to)}: ${etaText(bus,t.expiresAtProgress)} · ${arrivalTime(bus,t.expiresAtProgress)}</div>` : '';
    const crowd = t.status === 'active' && bus ? `<div class="ticket-crowd ${crowdStatus(bus).toLowerCase().replace(' ','-')}">${esc(crowdStatus(bus))} · ${bus.passengers}/${bus.capacity} aboard${bus.ticketSalesPaused ? ' · New tickets paused' : ''}</div>` : '';
    return `<article class="ticket ${t.status}"><div class="ticket-top"><strong>${esc(t.busId)}</strong><span>${t.status==='active'?'● ACTIVE':'PAST'} · UNPAID</span></div><div class="ticket-stops">${esc(t.from)} <span>→</span> ${esc(t.to)}</div>${boarding}${drop}${crowd}<div class="ticket-bottom"><span>${new Date(t.createdAt).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'})}</span><b>₹${t.amount}</b></div></article>`;
  };
  $('active-tickets').innerHTML = active.length ? active.map(card).join('') : '<p class="empty-ticket">No active ticket yet. Choose a bus to start.</p>';
  $('past-tickets').innerHTML = past.length ? past.slice(0,5).map(card).join('') : '<p class="empty-ticket">Your completed rides will appear here.</p>';
}
function renderBusList() {
  const buses = state.buses.filter(b => filter==='all' || b.type===filter);
  $('bus-count').textContent = `${buses.length} buses`;
  $('bus-list').innerHTML = buses.length ? buses.map(busCard).join('') : '<p class="empty-ticket">No buses in this filter.</p>';
  document.querySelectorAll('[data-select-bus]').forEach(el => el.onclick = () => openBus(el.dataset.selectBus));
}
function initMap() {
  if (!window.L) { $('map-fallback').hidden = false; return; }
  map = L.map('map',{scrollWheelZoom:false}).setView([13.047,80.236],11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; OpenStreetMap contributors',maxZoom:18}).addTo(map).on('tileerror',() => { if ($('map-fallback')) $('map-fallback').hidden = false; });
  updateMapMarkers();
}
function updateMapMarkers() {
  if (!map) return;
  markers.forEach(m => m.remove()); markers = [];
  if (routeLine) { routeLine.remove(); routeLine = null; }
  for (const b of state.buses.filter(b => filter==='all' || b.type===filter)) {
    const icon = L.divIcon({className:'bus-marker',html:`<span class="marker-body ${b.type==='AC'?'ac':''} ${selectedBus===b.id?'chosen':''}">🚌 ${esc(b.id)}</span>`,iconSize:[92,34],iconAnchor:[46,17]});
    markers.push(L.marker(position(b),{icon,title:`Bus ${b.id}`}).addTo(map).on('click',() => openBus(b.id)));
  }
  const selected = state.buses.find(b => b.id===selectedBus);
  if (selected) routeLine = L.polyline([...routeFor(selected).map(s => stops[s]),stops[routeFor(selected)[0]]],{color:'#217b74',weight:4,opacity:.75,dashArray:'8 8'}).addTo(map);
}
function closeModal() { $('bus-modal')?.remove(); }
function issueTicket(bus,destination,email) {
  if (salesBlocked(bus)) throw new Error('Ticket generation is paused by the conductor.');
  const route = routeFor(bus), now = progress(bus), index = route.indexOf(destination);
  if (index < 0) throw new Error('The selected stop is not on this route.');
  const target = nextProgressForStop(bus,destination,now);
  const ticket = {id:uid(),email,busId:bus.id,from:nextStop(bus),to:destination,amount:fare(bus),type:bus.type,paymentStatus:'unpaid',status:'active',createdAt:Date.now(),boardingAtProgress:Math.floor(now)+1,expiresAtProgress:target};
  state.tickets.push(ticket); save(); return ticket;
}
function openBus(id) {
  const b = state.buses.find(item => item.id===id); if (!b) return;
  closeModal(); selectedBus = id; renderBusList(); updateMapMarkers(); if (map) map.panTo(position(b));
  const route = routeFor(b), from = nextStop(b), choices = route.filter(s => s!==from);
  document.body.insertAdjacentHTML('beforeend',`<div class="modal-backdrop" id="bus-modal"><section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title"><button class="modal-close" id="modal-close" aria-label="Close">×</button><span class="eyebrow">CHENNAI BUS · ${b.type}</span><h2 id="modal-title">Bus ${esc(b.id)}</h2><p class="modal-sub">${esc(route[0])} → ${esc(route.at(-1))}</p><div class="modal-stats"><div><span>Passengers</span><strong>${b.passengers} <small>/ ${b.capacity}</small></strong></div><div><span>Next stop</span><strong data-next-stop="${esc(b.id)}">${esc(from)}</strong></div></div><div class="route-stops">${route.map(s => `<span>${esc(s)}</span>`).join('')}</div><div class="fare-block"><span>Ticket fare · ${b.type}</span><strong>₹${fare(b)}</strong></div><label class="drop-label">Drop at<select id="drop-stop">${choices.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('')}</select></label><button class="primary wide" id="pay-gpay">Pay with GPay · ₹${fare(b)} <span>→</span></button><p class="payment-note">Google Pay is not connected yet. No charge will be made.</p></section></div>`);
  $('bus-modal').querySelector('.route-stops').innerHTML = upcomingStops(b).map(stop => `<span>${esc(stop.name)} · ${etaText(b,stop.target)} (${arrivalTime(b,stop.target)})</span>`).join('');
  $('bus-modal').querySelector('.modal-stats').insertAdjacentHTML('afterend',`<p class="crowd-notice ${crowdStatus(b).toLowerCase().replace(' ','-')}">${esc(crowdStatus(b))} · ${b.passengers}/${b.capacity} occupied. ${b.ticketSalesPaused ? 'New tickets are paused.' : 'New tickets are open.'} Arrival times are demo estimates.</p>`);
  if (salesBlocked(b)) { $('pay-gpay').disabled = true; $('pay-gpay').textContent = 'Ticket generation paused'; }
  $('modal-close').onclick = closeModal; $('bus-modal').onclick = e => { if (e.target.id==='bus-modal') closeModal(); };
  $('pay-gpay').onclick = () => showCheckout(b.id,$('drop-stop').value);
  $('modal-close').focus();
}
function showCheckout(busId,destination) {
  const b = state.buses.find(item => item.id===busId); if (!b) return;
  if (salesBlocked(b)) { openBus(busId); return; }
  $('bus-modal').querySelector('.modal-card').innerHTML = `<button class="modal-close" id="modal-close" aria-label="Close">×</button><div class="checkout-icon">G</div><span class="eyebrow">GOOGLE PAY</span><h2 id="modal-title">₹${fare(b)}</h2><p class="modal-sub">Bus ${esc(b.id)} · ${esc(b.type)} · to ${esc(destination)}</p><div class="checkout-explain">Google Pay is not connected. You can create a ticket without payment for now; no charge will be made.</div><button class="primary wide" id="confirm-ticket">Create ticket without payment</button><button class="text-button back-button" id="back-bus">Back to bus</button>`;
  $('modal-close').onclick = closeModal;
  $('back-bus').onclick = () => { closeModal(); openBus(busId); };
  $('confirm-ticket').onclick = () => {
    try { issueTicket(b,destination,session.email); } catch (error) { toast(error.message); openBus(busId); return; }
    closeModal(); renderTickets(); toast(`Ticket for bus ${busId} created without payment.`);
  };
}
function renderConductor() {
  const account = current(), b = state.buses.find(bus => bus.id===account.busId);
  layout(`<main class="simple-dashboard"><div class="page-intro"><div><span class="eyebrow">CONDUCTOR PORTAL</span><h1>Hello, ${esc(account.name)}.</h1><p>Your assigned bus and ticket activity.</p></div><span class="live-badge"><i></i> Approved conductor</span></div><div class="conductor-grid"><section class="surface"><span class="eyebrow">ASSIGNED BUS</span><h2>${b?esc(b.id):'Bus unavailable'}</h2><p>${b?esc(routeFor(b).join(' → ')):'Ask an admin to assign an active bus.'}</p><div class="metric-row"><div><span>Type</span><strong>${b?b.type:'—'}</strong></div><div><span>Fare</span><strong>${b?`₹${fare(b)}`:'—'}</strong></div><div><span>Next stop</span><strong id="conductor-next">${b?nextStop(b):'—'}</strong></div></div></section><section class="surface"><span class="eyebrow">TICKET ACTIVITY</span><h2>Tickets on this bus</h2><div id="conductor-stats"></div></section></div><section class="surface ticket-control-surface"><span class="eyebrow">TICKET CONTROL</span><h2>Manage ticket generation</h2><div id="ticket-control"></div></section><section class="surface seating-surface"><div class="seat-heading"><div><span class="eyebrow">MANUAL SEAT ENTRY</span><h2>Seat availability</h2><p>Tap a seat to mark it occupied or available. The passenger count updates immediately.</p></div><div class="seat-legend"><span><i class="seat-key available"></i> Available</span><span><i class="seat-key occupied"></i> Occupied</span></div></div><div id="seat-board"></div></section></main>`);
  renderConductorStats();
  if (b) renderSeatBoard(b);
}
function seatButton(bus, index) {
  if (index >= bus.capacity) return '<span class="seat-placeholder" aria-hidden="true"></span>';
  const occupied = bus.seats[index], number = index + 1;
  return `<button type="button" class="seat ${occupied?'occupied':'available'}" data-seat="${index}" aria-label="Seat ${number}, ${occupied?'occupied':'available'}" aria-pressed="${occupied}" title="Seat ${number}: ${occupied?'occupied':'available'}">${String(number).padStart(2,'0')}</button>`;
}
function renderSeatBoard(bus) {
  const target = $('seat-board'); if (!target) return;
  if (normalizeBus(bus)) save();
  const rows = Math.ceil(bus.capacity / 4);
  target.innerHTML = `<div class="seat-summary"><div><strong id="seats-available"></strong><span>Available</span></div><div><strong id="seats-occupied"></strong><span>Occupied</span></div><div><strong>${bus.capacity}</strong><span>Total seats</span></div></div><div class="seat-progress" aria-hidden="true"><span id="seat-progress-fill"></span></div><div class="bus-interior"><div class="bus-front"><span>FRONT OF BUS</span><span class="steering-wheel" aria-hidden="true">◉</span></div><div class="seat-rows">${Array.from({length:rows}, (_, row) => `<div class="seat-row"><span class="seat-row-label">${String(row+1).padStart(2,'0')}</span>${seatButton(bus,row*4)}${seatButton(bus,row*4+1)}<span class="seat-aisle" aria-hidden="true"></span>${seatButton(bus,row*4+2)}${seatButton(bus,row*4+3)}</div>`).join('')}</div><div class="bus-rear">REAR OF BUS</div></div><p class="seat-footnote">Seat changes are saved in this browser.</p>`;
  updateSeatSummary(bus);
  target.onclick = event => {
    const seat = event.target.closest('[data-seat]');
    if (!seat || !target.contains(seat)) return;
    const index = Number(seat.dataset.seat), before = crowdStatus(bus);
    if (!toggleSeat(bus.id,index)) return;
    const occupied = bus.seats[index];
    seat.classList.toggle('occupied',occupied);
    seat.classList.toggle('available',!occupied);
    seat.setAttribute('aria-label',`Seat ${index+1}, ${occupied?'occupied':'available'}`);
    seat.setAttribute('aria-pressed',String(occupied));
    seat.title = `Seat ${index+1}: ${occupied?'occupied':'available'}`;
    updateSeatSummary(bus); renderTicketControl(bus);
    if (before !== crowdStatus(bus) && crowdStatus(bus) !== 'Room available') toast(`Bus ${bus.id} is ${crowdStatus(bus).toLowerCase()}. Ticket generation remains open until you pause it.`);
  };
}
function updateSeatSummary(bus) {
  if (!$('seats-available')) return;
  $('seats-available').textContent = bus.capacity - bus.passengers;
  $('seats-occupied').textContent = bus.passengers;
  $('seat-progress-fill').style.width = `${bus.passengers / bus.capacity * 100}%`;
}
function renderConductorStats() {
  const account = current(), b = state.buses.find(bus => bus.id===account?.busId), target = $('conductor-stats'); if (!target) return;
  if ($('conductor-next') && b) $('conductor-next').textContent = nextStop(b);
  const tickets = state.tickets.filter(t => t.busId===account.busId);
  target.innerHTML = `<div class="stat-grid conductor-stat-grid"><div><strong>${tickets.filter(t => t.status==='active').length}</strong><span>Active tickets</span></div></div>`;
  renderTicketControl(b);
}
function renderTicketControl(bus) {
  const target = $('ticket-control'); if (!target) return;
  if (!bus) { target.innerHTML = '<p class="empty-ticket">No assigned bus is available.</p>'; return; }
  const status = crowdStatus(bus);
  target.innerHTML = `<div class="control-top"><span class="ticket-crowd ${status.toLowerCase().replace(' ','-')}">${esc(status)} · ${bus.passengers}/${bus.capacity} occupied</span><span class="sales-state ${bus.ticketSalesPaused?'paused':''}">${bus.ticketSalesPaused?'Tickets paused':'Tickets open'}</span></div>${status !== 'Room available' ? `<p class="crowd-alert" role="alert">${status === 'Full' ? 'All seats are occupied.' : 'This bus is getting crowded.'} New tickets remain available until you pause generation.</p>` : ''}<button class="primary" id="toggle-ticket-sales">${bus.ticketSalesPaused ? 'Resume ticket generation' : 'Pause ticket generation'}</button><p class="device-update">Only the conductor can pause or resume new tickets for this bus.</p>`;
  $('toggle-ticket-sales').onclick = () => { bus.ticketSalesPaused = !bus.ticketSalesPaused; save(); renderTicketControl(bus); toast(bus.ticketSalesPaused ? 'New tickets paused for this bus.' : 'Ticket generation resumed for this bus.'); };
}
function renderAdmin() {
  layout(`<main class="simple-dashboard"><div class="page-intro"><div><span class="eyebrow">ADMIN CONTROL</span><h1>Fleet overview.</h1><p>Manage buses and conductor requests.</p></div></div><div class="admin-stats"><div><strong>${state.buses.length}</strong><span>Buses</span></div><div><strong>${state.requests.filter(r => r.status==='pending').length}</strong><span>Pending requests</span></div><div><strong>${state.accounts.filter(a => a.role==='conductor').length}</strong><span>Conductors</span></div></div><div class="admin-grid"><section class="surface"><div class="surface-heading"><div><span class="eyebrow">FLEET</span><h2>All buses</h2></div></div><div id="admin-buses" class="admin-list"></div></section><section class="surface"><span class="eyebrow">FLEET MANAGEMENT</span><h2>Add a bus</h2><form id="add-bus" class="form-grid compact"><label>Bus number<input name="id" required maxlength="14" placeholder="e.g. 29A"></label><label>Bus type<select name="type"><option>Non-AC</option><option>AC</option></select></label><label>Route<select name="route">${routes.map((r,i) => `<option value="${i}">${esc(r[0])} → ${esc(r.at(-1))}</option>`).join('')}</select></label><label>Capacity<input name="capacity" type="number" min="1" max="100" value="50" required></label><button class="primary wide" type="submit">Add bus</button></form></section></div><section class="surface requests-section"><div class="surface-heading"><div><span class="eyebrow">TEAM ACCESS</span><h2>Conductor requests</h2></div></div><div id="requests-list"></div></section></main>`);
  renderAdminLists();
  $('add-bus').onsubmit = e => { e.preventDefault(); const form = new FormData(e.currentTarget), id = String(form.get('id')).trim().toUpperCase(); if (state.buses.some(b => b.id.toLowerCase()===id.toLowerCase())) return toast('That bus number already exists.'); state.buses.push({id,type:String(form.get('type')),route:Number(form.get('route')),capacity:Number(form.get('capacity')),passengers:0,pace:45,phase:0}); save(); renderAdmin(); toast(`Bus ${id} added.`); };
}
function renderAdminLists() {
  $('admin-buses').innerHTML = state.buses.map(b => `<div class="admin-row"><div><strong>${esc(b.id)}</strong><span>${esc(b.type)} · ${esc(routeFor(b)[0])} → ${esc(routeFor(b).at(-1))}</span></div><button class="danger-button" data-delete="${esc(b.id)}">Delete</button></div>`).join('') || '<p class="empty-ticket">No buses yet.</p>';
  document.querySelectorAll('[data-delete]').forEach(button => button.onclick = () => { const id = button.dataset.delete; if (!confirm(`Delete bus ${id}? Its active tickets will move to Past tickets.`)) return; state.buses = state.buses.filter(b => b.id!==id); for (const ticket of state.tickets) if (ticket.busId===id && ticket.status==='active') { ticket.status='past'; ticket.endedAt=Date.now(); } save(); renderAdmin(); toast(`Bus ${id} deleted.`); });
  const requests = [...state.requests].sort((a,b) => Number(b.status==='pending')-Number(a.status==='pending') || b.createdAt-a.createdAt);
  $('requests-list').innerHTML = requests.length ? requests.map(r => `<div class="request-row"><div><strong>${esc(r.name)}</strong><span>${esc(r.email)} · ${esc(r.phone)} · Staff ${esc(r.staffId)}</span><span>${esc(r.depot)} depot · Bus ${esc(r.busId)} · ${new Date(r.createdAt).toLocaleDateString('en-IN')}</span></div><div class="request-actions">${r.status==='pending'?`<button class="approve-button" data-approve="${esc(r.id)}">Accept</button><button class="danger-button" data-decline="${esc(r.id)}">Decline</button>`:`<span class="status-tag ${r.status}">${esc(r.status)}</span>`}</div></div>`).join('') : '<p class="empty-ticket">No conductor requests yet.</p>';
  document.querySelectorAll('[data-approve]').forEach(b => b.onclick = () => decideRequest(b.dataset.approve,'approved'));
  document.querySelectorAll('[data-decline]').forEach(b => b.onclick = () => decideRequest(b.dataset.decline,'declined'));
}
function decideRequest(id,decision) {
  const request = state.requests.find(r => r.id===id && r.status==='pending'); if (!request) return;
  if (decision==='approved' && !state.buses.some(b => b.id===request.busId)) return toast('This bus was deleted. Add it again before approving.');
  request.status = decision;
  if (decision==='approved') state.accounts.push({name:request.name,email:request.email,password:request.password,role:'conductor',busId:request.busId});
  save(); renderAdmin(); toast(`Conductor request ${decision}.`);
}
document.addEventListener('keydown', e => { if (e.key==='Escape') closeModal(); });
initialize();
