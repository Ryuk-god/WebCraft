// --- DOM ELEMENTS ---
const loginView = document.getElementById('login-view');
const mainAppView = document.getElementById('main-app-view');
const welcomeMessage = document.getElementById('welcome-message');
const groupListView = document.getElementById('group-list-view');
const groupDetailView = document.getElementById('group-detail-view');
const createGroupForm = document.getElementById('create-group-form');
const groupNameInput = document.getElementById('group-name-input');
const groupCurrencySelect = document.getElementById('group-currency-select');
const groupsContainer = document.getElementById('groups-container');
const loginFormContainer = document.getElementById('login-form-container');
const registerFormContainer = document.getElementById('register-form-container');
const showRegisterLink = document.getElementById('show-register');
const showLoginLink = document.getElementById('show-login');
const settlementModal = document.getElementById('settlement-modal');
const settlementModalText = document.getElementById('settlement-modal-text');
const settlementForm = document.getElementById('settlement-form');
const proofImageInput = document.getElementById('proof-image-input');
const settlementAmountInput = document.getElementById('settlement-amount-input');
const cancelSettlementBtn = document.getElementById('cancel-settlement-btn');

let currentGroup = {};
const currencies = { "USD": "$", "EUR": "€", "INR": "₹", "GBP": "£" };
const exchangeRates = { "USD": {"INR": 83.50, "EUR": 0.92, "GBP": 0.79, "USD": 1}, "INR": {"USD": 0.012, "EUR": 0.011, "GBP": 0.009, "INR": 1}, "EUR": {"USD": 1.08, "INR": 90.50, "GBP": 0.85, "EUR": 1}, "GBP": {"USD": 1.27, "INR": 106.25, "EUR": 1.17, "GBP": 1} };


async function apiCall(endpoint, options = {}) {
    try {
        const response = await fetch(endpoint, options);
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: response.statusText }));
            console.error('API Error:', errorData);
            return { error: true, data: errorData };
        }
        if (response.status === 204) return true;
        return await response.json();
    } catch (error) {
        console.error("API call failed:", error);
        return { error: true, data: { error: "Network or script error." } };
    }
}

// --- INITIALIZATION & AUTH ---
document.addEventListener('DOMContentLoaded', async () => {
    groupCurrencySelect.innerHTML = Object.keys(currencies).map(key => `<option value="${key}">${key} (${currencies[key]})</option>`).join('');
    const user = await apiCall('/api/auth/current_user');
    initializeApp(user);
});
function initializeApp(user) { if (user) { loginView.classList.add('hidden'); mainAppView.classList.remove('hidden'); welcomeMessage.textContent = `Welcome, ${user.username}!`; fetchAndRenderGroups(); } else { loginView.classList.remove('hidden'); mainAppView.classList.add('hidden'); } }

// --- VIEW MANAGEMENT ---
function showGroupList() { groupDetailView.classList.add('hidden'); groupListView.classList.remove('hidden'); groupDetailView.innerHTML = ''; fetchAndRenderGroups(); }
async function showGroupDetails(groupId) { currentGroup = await apiCall(`/api/groups/${groupId}`); if (currentGroup && !currentGroup.error) { groupListView.classList.add('hidden'); groupDetailView.classList.remove('hidden'); renderGroupDetail(); } }

// --- DATA FETCHING & RENDERING ---
async function fetchAndRenderGroups() { const groups = await apiCall('/api/groups'); if (groups && !groups.error) renderGroups(groups); }
function renderGroups(groups) { groupsContainer.innerHTML = groups.map(group => `<div class="card p-4 flex justify-between items-center hover:shadow-lg cursor-pointer" onclick="showGroupDetails(${group.id})"><div><span class="font-semibold text-lg text-gray-800">${group.name}</span></div><span class="text-lg font-mono bg-gray-200 text-gray-700 px-3 py-1 rounded-md">${currencies[group.currency_key]}</span></div>`).join('') || `<p class="text-center text-gray-500 p-4">You have no groups yet.</p>`; }

function renderGroupDetail(settlementCurrencyKey) {
    settlementCurrencyKey = settlementCurrencyKey || currentGroup.currency_key;
    const membersListHTML = currentGroup.members.length > 0 ? currentGroup.members.map(m => `<span class="bg-indigo-100 text-indigo-800 text-sm font-medium mr-2 mb-2 inline-block px-2.5 py-0.5 rounded">${m}</span>`).join('') : '<p class="text-gray-500">No members yet.</p>';
    const paidByInputsHTML = currentGroup.members.map(m => `<div class="flex items-center justify-between"><label for="paid-by-${m}">${m} paid:</label><input type="number" id="paid-by-${m}" min="0" step="0.01" placeholder="0.00" class="w-2/5 text-right"></div>`).join('');
    const shareInputsHTML = currentGroup.members.map(m => `<div class="flex items-center justify-between"><label for="share-for-${m}">${m}'s share:</label><input type="number" id="share-for-${m}" min="0" step="0.01" placeholder="0.00" class="w-2/5 text-right custom-share-input" disabled></div>`).join('');
    
    const { transactions } = calculateSummary();
    const rate = exchangeRates[currentGroup.currency_key][settlementCurrencyKey];
    const settlementSymbol = currencies[settlementCurrencyKey];
    const summaryHTML = transactions.length > 0 ? transactions.map(t => `<li class="flex items-center p-3 bg-green-50 rounded-lg"><span class="font-semibold text-green-800">${t.from}</span><svg class="h-5 w-5 mx-2 text-green-600" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd" /></svg><span class="font-semibold text-green-800">${t.to}</span><span class="ml-auto font-bold text-lg text-green-800">${settlementSymbol}${(t.amount * rate).toFixed(2)}</span><button onclick="openSettlementModal('${t.from}', '${t.to}', ${t.amount})" class="btn btn-sm btn-secondary ml-3">Settle</button></li>`).join('') : '<p class="text-center text-gray-500 p-4">All settled up!</p>';
    
    const settledPaymentsHTML = currentGroup.payments.map(p => {
        let suspicionBadge = '';
        if (p.is_suspicious) { suspicionBadge = `<div class="mt-2 p-2 bg-yellow-100 text-yellow-800 text-xs rounded border border-yellow-300 flex items-center gap-2"><svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.21 3.03-1.742 3.03H4.42c-1.532 0-2.492-1.696-1.742-3.03l5.58-9.92zM10 13a1 1 0 110-2 1 1 0 010 2zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path></svg><span><strong>Suspicious:</strong> ${p.suspicion_reason}</span></div>`; }
        const proofLink = p.proof_image_path ? `<a href="${p.proof_image_path}" target="_blank" class="btn btn-sm btn-secondary ml-3">View Proof</a>` : '';
        return `<li class="p-3 bg-gray-100 rounded-lg"><div class="flex items-center"><span>✔️ <strong>${p.from_member}</strong> paid <strong>${p.to_member}</strong></span><span class="ml-auto font-mono">${currencies[currentGroup.currency_key]}${p.amount.toFixed(2)}</span>${proofLink}</div>${suspicionBadge}</li>`;
    }).join('');

    const currencyOptionsHTML = Object.keys(currencies).map(key => `<option value="${key}" ${key === settlementCurrencyKey ? 'selected' : ''}>${key}</option>`).join('');
    groupDetailView.innerHTML = `<div class="space-y-6"><div class="flex justify-between items-center mb-4"><button onclick="showGroupList()" class="btn btn-secondary">&larr; Back</button><h2 class="text-3xl font-bold text-gray-800">${currentGroup.name}</h2><div></div></div><div class="card p-6"><h3 class="text-xl font-semibold mb-4">Group Members</h3><div class="mb-4">${membersListHTML}</div><div class="flex gap-4"><input type="text" id="add-member-input" placeholder="New member's name" class="flex-grow"><button onclick="addMember()" class="btn btn-secondary">Add</button></div></div>${currentGroup.members.length > 1 ? `<div class="card p-6"><h3 class="text-xl font-semibold mb-4">Add New Expense</h3><input type="text" id="expense-description" placeholder="Description" class="mb-4"><input type="number" id="expense-amount" placeholder="Total Amount (${currencies[currentGroup.currency_key]})" min="0.01" step="0.01" class="mb-4"><div class="grid md:grid-cols-2 gap-6"><div class="space-y-3 p-4 bg-gray-50 rounded-lg"><h4 class="font-semibold">Who Paid?</h4>${paidByInputsHTML}</div><div class="space-y-3 p-4 bg-gray-50 rounded-lg"><h4 class="font-semibold">How to Split?</h4><div class="flex gap-4"><label><input type="radio" name="split-method" value="equally" onchange="toggleCustomShare(false)" checked> Equally</label><label><input type="radio" name="split-method" value="custom" onchange="toggleCustomShare(true)"> Custom</label></div><div class="space-y-2 mt-2">${shareInputsHTML}</div></div></div><button onclick="addExpense()" class="btn btn-primary w-full mt-6">Add Expense</button></div>` : ''}<div class="card p-6"><div class="flex justify-between items-center mb-4"><h3 class="text-xl font-semibold">Settlement Summary</h3><div class="flex items-center gap-2"><label for="settlement-currency" class="text-sm">Settle In:</label><select id="settlement-currency" onchange="renderGroupDetail(this.value)">${currencyOptionsHTML}</select></div></div><ul class="space-y-2">${summaryHTML}</ul></div><div class="card p-6"><h3 class="text-xl font-semibold text-gray-700 mb-4">Recorded Settlements</h3><ul class="space-y-2">${settledPaymentsHTML || '<p class="text-gray-500">No settlements recorded yet.</p>'}</ul></div></div>`;
}

// --- EVENT HANDLERS & ACTIONS ---
createGroupForm.addEventListener('submit', async e => { e.preventDefault(); const groupName = groupNameInput.value.trim(); const currencyKey = groupCurrencySelect.value; if (groupName && currencyKey) { await apiCall('/api/groups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: groupName, currencyKey }) }); groupNameInput.value = ''; fetchAndRenderGroups(); } });
showRegisterLink.addEventListener('click', e => { e.preventDefault(); loginFormContainer.classList.add('hidden'); registerFormContainer.classList.remove('hidden'); });
showLoginLink.addEventListener('click', e => { e.preventDefault(); registerFormContainer.classList.add('hidden'); loginFormContainer.classList.remove('hidden'); });
async function addMember() { const memberName = document.getElementById(`add-member-input`).value.trim(); if (memberName && !currentGroup.members.includes(memberName)) { await apiCall(`/api/groups/${currentGroup.id}/members`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: memberName }) }); showGroupDetails(currentGroup.id); } }
async function addExpense() { const description = document.getElementById('expense-description').value.trim(); const totalAmount = parseFloat(document.getElementById('expense-amount').value); if (!description || isNaN(totalAmount) || totalAmount <= 0) return alert("Invalid description or amount."); let paidTotal = 0; const paidBy = currentGroup.members.map(m => { const amount = parseFloat(document.getElementById(`paid-by-${m}`).value) || 0; paidTotal += amount; return { member: m, amount }; }).filter(p => p.amount > 0); if (Math.abs(paidTotal - totalAmount) > 0.01) return alert(`Paid amounts don't match total.`); const shares = {}; const splitMethod = document.querySelector('input[name="split-method"]:checked').value; if (splitMethod === 'equally') { const share = totalAmount / currentGroup.members.length; currentGroup.members.forEach(m => shares[m] = share); } else { let sharesTotal = 0; currentGroup.members.forEach(m => { const share = parseFloat(document.getElementById(`share-for-${m}`).value) || 0; shares[m] = share; sharesTotal += share; }); if (Math.abs(sharesTotal - totalAmount) > 0.01) return alert(`Shares total doesn't match total.`); } await apiCall(`/api/groups/${currentGroup.id}/expenses`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ description, totalAmount, paidBy, shares }) }); showGroupDetails(currentGroup.id); }
function openSettlementModal(from, to, amount) { const fullAmount = amount.toFixed(2); settlementModalText.textContent = `Confirm that ${from} is paying ${to}. Total debt is ${currencies[currentGroup.currency_key]}${fullAmount}.`; settlementAmountInput.value = fullAmount; settlementAmountInput.max = fullAmount; settlementForm.dataset.from = from; settlementForm.dataset.to = to; settlementModal.classList.remove('hidden'); }
function closeSettlementModal() { settlementForm.reset(); settlementModal.classList.add('hidden'); }
cancelSettlementBtn.addEventListener('click', closeSettlementModal);
settlementForm.addEventListener('submit', async e => {
    e.preventDefault();
    const { from, to } = settlementForm.dataset;
    const proofImage = proofImageInput.files[0];
    const amountToSettle = parseFloat(settlementAmountInput.value);

    if (isNaN(amountToSettle) || amountToSettle <= 0) { return alert('Please enter a valid amount greater than zero.'); }
    if (amountToSettle > parseFloat(settlementAmountInput.max)) { return alert(`Payment cannot be greater than the total debt of ${settlementAmountInput.max}.`); }
    if (!proofImage) { if (!confirm("You did not upload a proof image. Continue anyway?")) { return; } }

    const formData = new FormData();
    formData.append('from', from);
    formData.append('to', to);
    formData.append('amount', amountToSettle);
    if (proofImage) { formData.append('proofImage', proofImage); }

    const result = await apiCall(`/api/groups/${currentGroup.id}/payments`, { method: 'POST', body: formData });
    if (result && !result.error) {
        console.log("AI Analysis Result:", result.analysis);
        closeSettlementModal();
        showGroupDetails(currentGroup.id);
    } else {
        const errorMessage = result?.data?.error || 'An unknown error occurred.';
        let details = result?.data?.details || '';
        alert(`Failed to record payment:\n${errorMessage}\n${details}`);
    }
});

function toggleCustomShare(isCustom) { document.querySelectorAll('.custom-share-input').forEach(i => i.disabled = !isCustom); }
function calculateSummary() {
    const balances = currentGroup.members.reduce((acc, m) => ({ ...acc, [m]: 0 }), {});
    currentGroup.expenses.forEach(ex => {
        ex.paidBy.forEach(p => { balances[p.member] += p.amount; });
        currentGroup.members.forEach(m => { balances[m] -= ex.shares[m] || 0; });
    });
    currentGroup.payments.forEach(p => {
        balances[p.from_member] += p.amount;
        balances[p.to_member] -= p.amount;
    });
    const debtors = Object.entries(balances).filter(([,a]) => a < -0.01).map(([p,a]) => ({person: p, amount: a}));
    const creditors = Object.entries(balances).filter(([,a]) => a > 0.01).map(([p,a]) => ({person: p, amount: a}));
    const transactions = [];
    while (debtors.length > 0 && creditors.length > 0) {
        const debtor = debtors[0], creditor = creditors[0];
        const amount = Math.min(-debtor.amount, creditor.amount);
        transactions.push({ from: debtor.person, to: creditor.person, amount });
        debtor.amount += amount;
        creditor.amount -= amount;
        if (Math.abs(debtor.amount) < 0.01) debtors.shift();
        if (Math.abs(creditor.amount) < 0.01) creditors.shift();
    }
    return { transactions };
}
