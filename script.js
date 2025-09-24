let appData = { groups: [], nextGroupId: 1, nextExpenseId: 1 };

const currencies = { "USD": "$", "EUR": "€", "INR": "₹", "GBP": "£" };
const exchangeRates = {
    "USD": {"INR": 83.50, "EUR": 0.92, "GBP": 0.79, "USD": 1},
    "INR": {"USD": 0.012, "EUR": 0.011, "GBP": 0.009, "INR": 1},
    "EUR": {"USD": 1.08, "INR": 90.50, "GBP": 0.85, "EUR": 1},
    "GBP": {"USD": 1.27, "INR": 106.25, "EUR": 1.17, "GBP": 1}
};

const groupListView = document.getElementById('group-list-view');
const groupDetailView = document.getElementById('group-detail-view');
const createGroupForm = document.getElementById('create-group-form');
const groupNameInput = document.getElementById('group-name-input');
const groupCurrencySelect = document.getElementById('group-currency-select');
const groupsContainer = document.getElementById('groups-container');

createGroupForm.addEventListener('submit', handleCreateGroup);

function handleCreateGroup(e) {
    e.preventDefault();
    const groupName = groupNameInput.value.trim();
    const currencyKey = groupCurrencySelect.value;
    if (groupName && currencyKey) {
        appData.groups.push({
            id: appData.nextGroupId++, name: groupName, currency: currencies[currencyKey], currencyKey: currencyKey,
            members: [], expenses: [], payments: []
        });
        groupNameInput.value = '';
        renderGroups();
        saveData();
    }
}

function addMember(groupId) {
    const input = document.getElementById(`add-member-input-${groupId}`);
    const memberName = input.value.trim();
    if (!memberName) return;
    const group = appData.groups.find(g => g.id === groupId);
    if (group && !group.members.includes(memberName)) {
        group.members.push(memberName);
        renderGroupDetail(groupId);
        saveData();
    }
}

function addExpense(groupId) {
    const group = appData.groups.find(g => g.id === groupId);
    if (!group) return;

    const description = document.getElementById('expense-description').value.trim();
    const totalAmount = parseFloat(document.getElementById('expense-amount').value);
    if (!description || isNaN(totalAmount) || totalAmount <= 0) {
        alert("Please fill description and total amount correctly.");
        return;
    }
    
    const paidBy = [];
    let paidTotal = 0;
    group.members.forEach(member => {
        const paidInput = document.getElementById(`paid-by-${member}`);
        const paidAmount = parseFloat(paidInput.value) || 0;
        if (paidAmount > 0) {
            paidBy.push({ member: member, amount: paidAmount });
            paidTotal += paidAmount;
        }
    });

    paidTotal = Math.round(paidTotal * 100) / 100;
    if (Math.abs(paidTotal - totalAmount) > 0.01) {
        alert(`The sum of amounts paid (${paidTotal.toFixed(2)}) does not match the total expense (${totalAmount.toFixed(2)}).`);
        return;
    }

    const shares = {};
    let sharesTotal = 0;
    const splitMethod = document.querySelector('input[name="split-method"]:checked').value;
    if (splitMethod === 'equally') {
        const share = totalAmount / group.members.length;
        group.members.forEach(member => shares[member] = share);
    } else {
        group.members.forEach(member => {
            const shareInput = document.getElementById(`share-for-${member}`);
            shares[member] = parseFloat(shareInput.value) || 0;
            sharesTotal += shares[member];
        });
        sharesTotal = Math.round(sharesTotal * 100) / 100;
        if (Math.abs(sharesTotal - totalAmount) > 0.01) {
            alert(`Sum of shares (${sharesTotal.toFixed(2)}) does not match total amount (${totalAmount.toFixed(2)}).`);
            return;
        }
    }

    group.expenses.push({
        id: appData.nextExpenseId++, description, total: totalAmount, paidBy, shares
    });
    renderGroupDetail(groupId);
    saveData();
}

function initiateSettlement(groupId, from, to, amount) {
    if (!confirm(`To settle, you must upload an image as proof of payment from ${from} to ${to}. Continue?`)) {
        return;
    }

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';

    fileInput.onchange = e => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = readerEvent => {
            const proofDataUrl = readerEvent.target.result;
            recordPayment(groupId, from, to, amount, proofDataUrl);
        };
        reader.readAsDataURL(file);
    };

    fileInput.click();
}

function recordPayment(groupId, from, to, amount, proofUrl) {
    const group = appData.groups.find(g => g.id === groupId);
    if (group) {
        group.payments.push({ from, to, amount, date: new Date().toISOString(), proofUrl: proofUrl });
        renderGroupDetail(groupId);
        saveData();
    }
}

function deletePayment(groupId, paymentIndex) {
    if (!confirm('Are you sure you want to delete this payment record?')) return;
    const group = appData.groups.find(g => g.id === groupId);
    if (group && group.payments[paymentIndex]) {
        group.payments.splice(paymentIndex, 1);
        renderGroupDetail(groupId);
        saveData();
    }
}

function calculateSummary(groupId) {
    const group = appData.groups.find(g => g.id === groupId);
    if (!group || group.members.length === 0) return { transactions: [], balances: {} };

    const balances = group.members.reduce((acc, member) => ({ ...acc, [member]: 0 }), {});
    
    // Calculate initial balances from all expenses
    group.expenses.forEach(expense => {
        expense.paidBy.forEach(p => { balances[p.member] += p.amount; });
        group.members.forEach(member => { balances[member] -= expense.shares[member] || 0; });
    });
    
    // Apply all recorded payments to the balances
    group.payments.forEach(payment => {
        // The payer's balance increases (moves toward 0 from a negative number)
        balances[payment.from] += payment.amount;
        // The receiver's balance decreases (moves toward 0 from a positive number)
        balances[payment.to] -= payment.amount;
    });

    const debtors = Object.entries(balances).filter(([,a]) => a < -0.01).map(([p,a])=>({person: p, amount: a}));
    const creditors = Object.entries(balances).filter(([,a]) => a > 0.01).map(([p,a])=>({person: p, amount: a}));
    
    debtors.sort((a, b) => a.amount - b.amount);
    creditors.sort((a, b) => b.amount - a.amount);

    const transactions = [];
    while (debtors.length > 0 && creditors.length > 0) {
        const debtor = debtors[0];
        const creditor = creditors[0];
        const amount = Math.min(-debtor.amount, creditor.amount);

        transactions.push({ from: debtor.person, to: creditor.person, amount });

        debtor.amount += amount;
        creditor.amount -= amount;

        if (Math.abs(debtor.amount) < 0.01) debtors.shift();
        if (Math.abs(creditor.amount) < 0.01) creditors.shift();
    }
    return { transactions, balances };
}

function saveData() { 
    localStorage.setItem('splitItData', JSON.stringify(appData)); 
}

function loadData() {
    const data = localStorage.getItem('splitItData');
    if (data) {
        appData = JSON.parse(data);
    }
}

function showGroupList() {
    groupDetailView.classList.add('hidden');
    groupListView.classList.remove('hidden');
    renderGroups();
}

function showGroupDetails(groupId) {
    groupListView.classList.add('hidden');
    groupDetailView.classList.remove('hidden');
    renderGroupDetail(groupId);
}

function renderGroups() {
    groupsContainer.innerHTML = appData.groups.map(group => `
        <div class="card p-4 flex justify-between items-center hover:shadow-lg cursor-pointer" onclick="showGroupDetails(${group.id})">
            <div>
                <span class="font-semibold text-lg text-gray-800">${group.name}</span>
                <span class="ml-3 text-sm text-gray-500">${group.members.length} members</span>
            </div>
            <span class="text-lg font-mono bg-gray-200 text-gray-700 px-3 py-1 rounded-md">${group.currency}</span>
        </div>
    `).join('') || '<p class="text-center text-gray-500 p-4">You have no groups yet.</p>';
}

function renderGroupDetail(groupId, settlementCurrencyKey = null) {
    const group = appData.groups.find(g => g.id === groupId);
    if (!group) return;
    
    settlementCurrencyKey = settlementCurrencyKey || group.currencyKey;
    
    const membersListHTML = group.members.length > 0 ? group.members.map(member => `<span class="bg-indigo-100 text-indigo-800 text-sm font-medium mr-2 mb-2 inline-block px-2.5 py-0.5 rounded">${member}</span>`).join('') : '<p class="text-gray-500">No members yet.</p>';
    
    const paidByInputsHTML = group.members.map(member => `<div class="flex items-center justify-between">
        <label for="paid-by-${member}" class="text-gray-600">${member} paid:</label>
        <input type="number" id="paid-by-${member}" min="0" step="0.01" placeholder="0.00" class="w-2/5 text-right">
    </div>`).join('');
    
    const shareInputsHTML = group.members.map(member => `<div class="flex items-center justify-between">
        <label for="share-for-${member}" class="text-gray-600">${member}'s share:</label>
        <input type="number" id="share-for-${member}" min="0" step="0.01" placeholder="0.00" class="w-2/5 text-right custom-share-input" disabled>
    </div>`).join('');

    const { transactions } = calculateSummary(groupId);
    const rate = exchangeRates[group.currencyKey][settlementCurrencyKey];
    const settlementCurrencySymbol = currencies[settlementCurrencyKey];
    const summaryHTML = transactions.length > 0 ? transactions.map(t => {
        const convertedAmount = t.amount * rate;
        return `<li class="flex items-center p-3 bg-green-50 rounded-lg">
            <span class="font-semibold text-green-800">${t.from}</span>
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mx-2 text-green-600" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd" /></svg>
            <span class="font-semibold text-green-800">${t.to}</span>
            <span class="ml-auto font-bold text-lg text-green-800">${settlementCurrencySymbol}${convertedAmount.toFixed(2)}</span>
            <button onclick="initiateSettlement(${groupId}, '${t.from}', '${t.to}', ${t.amount})" class="btn btn-sm btn-secondary ml-3">Settle</button>
        </li>`;
    }).join('') : '<p class="text-center text-gray-500 p-4">All settled up!</p>';
    
    const paymentsHistoryHTML = group.payments.length > 0 ? group.payments.slice().reverse().map((p, index) => {
        const originalIndex = group.payments.length - 1 - index;
        const proofLink = p.proofUrl ? `<a href="${p.proofUrl}" target="_blank" class="text-sm text-indigo-600 hover:underline ml-4">View Proof</a>` : '';
        return `<li class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div class="flex items-center text-sm">
                <span>
                    <span class="font-semibold">${p.from}</span> paid <span class="font-semibold">${p.to}</span>
                    <span class="font-mono ml-2">${group.currency}${p.amount.toFixed(2)}</span>
                </span>
                ${proofLink}
            </div>
            <button onclick="deletePayment(${groupId}, ${originalIndex})" class="btn btn-sm btn-danger">Delete</button>
        </li>`
    }).join('') : '<p class="text-center text-gray-500 p-4">No payments recorded yet.</p>';

    const currencyOptionsHTML = Object.keys(currencies).map(key => `<option value="${key}" ${key === settlementCurrencyKey ? 'selected' : ''}>${key}</option>`).join('');

    groupDetailView.innerHTML = `
        <div class="space-y-6">
            <div class="flex justify-between items-center mb-4">
                <button onclick="showGroupList()" class="btn btn-secondary flex items-center">&larr; Back</button>
                <h2 class="text-3xl font-bold text-gray-800 text-center">${group.name}</h2>
                <div></div>
            </div>
            <div class="card p-6">
                <h3 class="text-xl font-semibold mb-4 text-gray-700">Group Members</h3>
                <div class="mb-4">${membersListHTML}</div>
                <div class="flex flex-col sm:flex-row gap-4">
                    <input type="text" id="add-member-input-${groupId}" placeholder="New member's name" class="flex-grow">
                    <button onclick="addMember(${groupId})" class="btn btn-secondary">Add Member</button>
                </div>
            </div>
            ${group.members.length > 1 ? `<div class="card p-6">
                <h3 class="text-xl font-semibold mb-4 text-gray-700">Add New Expense</h3>
                <input type="text" id="expense-description" placeholder="Description (e.g., Dinner)" class="mb-4">
                <input type="number" id="expense-amount" placeholder="Total Amount (${group.currency})" min="0.01" step="0.01" class="mb-4">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div class="space-y-3 p-4 bg-gray-50 rounded-lg"><h4 class="font-semibold text-gray-600 mb-2">Who Paid?</h4>${paidByInputsHTML}</div>
                    <div class="space-y-3 p-4 bg-gray-50 rounded-lg"><h4 class="font-semibold text-gray-600 mb-2">How to Split?</h4>
                        <div class="flex gap-4">
                            <label class="flex items-center"><input type="radio" name="split-method" value="equally" onchange="document.querySelectorAll('.custom-share-input').forEach(i=>i.disabled=true)" checked> <span class="ml-2">Equally</span></label>
                            <label class="flex items-center"><input type="radio" name="split-method" value="custom" onchange="document.querySelectorAll('.custom-share-input').forEach(i=>i.disabled=false)"> <span class="ml-2">Custom</span></label>
                        </div>
                        <div class="space-y-2 mt-2">${shareInputsHTML}</div>
                    </div>
                </div>
                <button onclick="addExpense(${groupId})" class="btn btn-primary w-full mt-6">Add Expense</button>
            </div>` : ''}
            <div class="card p-6">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-xl font-semibold text-gray-700">Settlement Summary</h3>
                    <div class="flex items-center gap-2">
                        <label for="settlement-currency" class="text-sm">Settle In:</label>
                        <select id="settlement-currency" onchange="renderGroupDetail(${groupId}, this.value)">${currencyOptionsHTML}</select>
                    </div>
                </div>
                <ul class="space-y-2">${summaryHTML}</ul>
            </div>
            <div class="card p-6">
                <h3 class="text-xl font-semibold text-gray-700 mb-4">Payment History</h3>
                <ul class="space-y-2">${paymentsHistoryHTML}</ul>
            </div>
        </div>`;
}

function init() {
    groupCurrencySelect.innerHTML = Object.keys(currencies).map(key => `<option value="${key}">${key} (${currencies[key]})</option>`).join('');
    loadData();
    renderGroups();
}

// Start the application
init();
