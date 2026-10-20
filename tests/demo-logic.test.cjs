const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'dist', 'chennai.js'), 'utf8').replace(/initialize\(\);\s*$/, '');
const storage = new Map();
const context = vm.createContext({
  console, Date, Math, TextEncoder, crypto: require('node:crypto').webcrypto,
  window: {},
  document: {addEventListener() {}},
  localStorage: {setItem(key, value) { storage.set(key, value); }},
  sessionStorage: {setItem() {}, removeItem() {}}
});
vm.runInContext(source, context);

assert.equal(vm.runInContext("fare({type:'Non-AC'})", context), 20);
assert.equal(vm.runInContext("fare({type:'AC'})", context), 40);
vm.runInContext(`state = {started:Date.now()-25000,buses:[{id:'21G',type:'Non-AC',route:0,passengers:20,capacity:50,pace:10,phase:0}],tickets:[{busId:'21G',status:'active',expiresAtProgress:2},{busId:'21G',status:'active',expiresAtProgress:3}]}`, context);
assert.equal(vm.runInContext('nextStop(state.buses[0])', context), 'Guindy');
assert.equal(vm.runInContext('position(state.buses[0]).every(Number.isFinite)', context), true);
assert.equal(vm.runInContext('expireTickets()', context), true);
assert.equal(vm.runInContext("state.tickets.filter(t => t.status === 'past').length", context), 1);
assert.equal(vm.runInContext("state.tickets.filter(t => t.status === 'active').length", context), 1);
assert.equal(JSON.parse(storage.get('fobus-chennai-demo-v1')).tickets[0].status, 'past');
vm.runInContext("issueTicket(state.buses[0], 'Chennai Central', 'test@gmail.com')", context);
assert.equal(vm.runInContext('state.tickets.at(-1).amount', context), 20);
assert.equal(vm.runInContext('state.tickets.at(-1).status', context), 'active');
assert.equal(vm.runInContext('state.tickets.at(-1).paymentStatus', context), 'unpaid');
assert.equal(vm.runInContext('state.tickets.at(-1).expiresAtProgress > progress(state.buses[0])', context), true);
assert.equal(vm.runInContext('state.tickets.at(-1).boardingAtProgress > progress(state.buses[0])', context), true);
assert.equal(vm.runInContext("upcomingStops(state.buses[0]).length", context), 4);
assert.equal(vm.runInContext("etaText(state.buses[0], nextProgressForStop(state.buses[0], 'Chennai Central')) !== 'Unavailable'", context), true);
assert.equal(vm.runInContext('normalizeBus(state.buses[0])', context), true);
assert.equal(vm.runInContext('state.buses[0].seats.length', context), 50);
assert.equal(vm.runInContext('state.buses[0].seats.filter(Boolean).length', context), 20);
vm.runInContext("state.accounts=[{email:'test@gmail.com',role:'conductor',busId:'21G'}]; session={email:'test@gmail.com',role:'conductor'}", context);
assert.equal(vm.runInContext("toggleSeat('21G',25)", context), true);
assert.equal(vm.runInContext('state.buses[0].passengers', context), 21);
assert.equal(vm.runInContext("toggleSeat('21G',25)", context), true);
assert.equal(vm.runInContext('state.buses[0].passengers', context), 20);
vm.runInContext("session.role='user'", context);
assert.equal(vm.runInContext("toggleSeat('21G',25)", context), false);
vm.runInContext('state.buses[0].ticketSalesPaused = true', context);
assert.equal(vm.runInContext('salesBlocked(state.buses[0])', context), true);
assert.throws(() => vm.runInContext("issueTicket(state.buses[0], 'Chennai Central', 'test@gmail.com')", context), /paused/);
vm.runInContext('state.buses[0].ticketSalesPaused = false; state.buses[0].seats.fill(true); state.buses[0].passengers = 50', context);
assert.equal(vm.runInContext('crowdStatus(state.buses[0])', context), 'Full');
assert.equal(vm.runInContext('salesBlocked(state.buses[0])', context), false);
assert.doesNotThrow(() => vm.runInContext("issueTicket(state.buses[0], 'Chennai Central', 'test@gmail.com')", context));
vm.runInContext("state.buses.push({id:'27C',type:'Non-AC',route:2,passengers:30,capacity:50,pace:45,phase:0}); state.demo27CReady=false", context);
assert.equal(vm.runInContext('ensureDemo27C()', context), true);
assert.equal(vm.runInContext("state.buses.find(b => b.id==='27C').passengers", context), 50);
assert.equal(vm.runInContext("state.accounts.find(a => a.email==='cond27c@gmail.com').busId", context), '27C');
assert.equal(vm.runInContext('ensureDemo27C()', context), false);
vm.runInContext("state.buses.find(b => b.id==='27C').seats[0]=false; state.buses.find(b => b.id==='27C').passengers=49; ensureDemo27C()", context);
assert.equal(vm.runInContext("state.buses.find(b => b.id==='27C').passengers", context), 49);
assert.equal(vm.runInContext("initialBuses.find(b => b.id==='27C').passengers", context), 50);
assert.equal(vm.runInContext("state.accounts.find(a => a.email==='cond27c@gmail.com').password", context), require('node:crypto').createHash('sha256').update('Team@2801').digest('hex'));
vm.runInContext("state.buses=state.buses.filter(b=>b.id!=='27C'); state.accounts=state.accounts.filter(a=>a.email!=='cond27c@gmail.com'); state.demo27CReady=false; ensureDemo27C()", context);
assert.equal(vm.runInContext("state.buses.find(b => b.id==='27C').passengers", context), 50);
vm.runInContext("state.accounts=[]; state.requests=[{id:'one',status:'pending',name:'Test',email:'test@gmail.com',password:'hash',busId:'21G'}]; renderAdmin=()=>{}; toast=()=>{}; decideRequest('one','approved')", context);
assert.equal(vm.runInContext("state.accounts[0].role", context), 'conductor');
assert.equal(vm.runInContext("state.requests[0].status", context), 'approved');
vm.runInContext("state.accounts.push({name:'Old Admin',email:'admin@fobus.demo',password:'old',role:'admin'}); state.accounts.push({name:'Passenger',email:'passenger@gmail.com',password:'hash',role:'user'})", context);
assert.equal(vm.runInContext('synchronizeAdminAccount()', context), true);
assert.equal(vm.runInContext("state.accounts.filter(a => a.role === 'admin').length", context), 1);
assert.equal(vm.runInContext("findLoginAccount(ADMIN_EMAIL,'user').role", context), 'admin');
assert.equal(vm.runInContext("findLoginAccount(ADMIN_EMAIL,'conductor')", context), undefined);
assert.equal(vm.runInContext("findLoginAccount('passenger@gmail.com','user').role", context), 'user');
console.log('Chennai demo logic checks passed');
