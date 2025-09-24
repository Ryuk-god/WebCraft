var myAppStuff = {
    groups: [],
    nextGroupId: 1,
    nextExpenseId: 1,
};

var groupListPage = document.getElementById('group-list-view');
var groupDetailPage = document.getElementById('group-detail-view');
var createGroupForm = document.getElementById('create-group-form');
var groupNameInput = document.getElementById('group-name-input');
var groupsContainer = document.getElementById('groups-container');

createGroupForm.addEventListener('submit', handleCreateGroup);

function handleCreateGroup(event) {
    event.preventDefault();
    var groupName = groupNameInput.value.trim();

    if (groupName) {
        var newGroup = {
            id: myAppStuff.nextGroupId++,
            name: groupName,
            members: [],
            expenses: []
        };
        myAppStuff.groups.push(newGroup);
        groupNameInput.value = '';
        renderGroups();
    }
}

function renderGroups() {
    if (myAppStuff.groups.length === 0) {
        groupsContainer.innerHTML = `<p class="text-center text-gray-500 p-4">You have no groups yet. Create one to get started!</p>`;
        return;
    }

    var allGroupsHTML = '';
    for (var i = 0; i < myAppStuff.groups.length; i++) {
        var group = myAppStuff.groups[i];
        allGroupsHTML += `
            <div class="card p-4 flex justify-between items-center hover:shadow-lg cursor-pointer" onclick="showGroupDetails(${group.id})">
                <span class="font-semibold text-lg text-gray-800">${group.name}</span>
                <span class="text-sm text-gray-500">${group.members.length} members</span>
            </div>
        `;
    }
    groupsContainer.innerHTML = allGroupsHTML;
}

function showGroupDetails(groupId) {
    groupListPage.classList.add('hidden');
    groupDetailPage.classList.remove('hidden');
    renderGroupDetail(groupId);
}

function showGroupList() {
    groupDetailPage.classList.add('hidden');
    groupListPage.classList.remove('hidden');
    renderGroups();
}

function addMember(groupId) {
    var input = document.getElementById(`add-member-input-${groupId}`);
    var memberName = input.value.trim();
    if (memberName === '') return;

    var theGroup;
    for (var i = 0; i < myAppStuff.groups.length; i++) {
        if (myAppStuff.groups[i].id === groupId) {
            theGroup = myAppStuff.groups[i];
            break;
        }
    }

    if (theGroup && !theGroup.members.includes(memberName)) {
        theGroup.members.push(memberName);
        renderGroupDetail(groupId);
    } else {
        input.value = 'Already exists!';
        setTimeout(function() { input.value = '' }, 1000);
    }
}

function addExpense(groupId) {
    var theGroup;
    for (var i = 0; i < myAppStuff.groups.length; i++) {
        if (myAppStuff.groups[i].id === groupId) {
            theGroup = myAppStuff.groups[i];
            break;
        }
    }
    
    var description = document.getElementById('expense-description').value.trim();
    var totalAmount = parseFloat(document.getElementById('expense-amount').value);
    var paidBy = document.getElementById('expense-paid-by').value;
    
    if (!description || isNaN(totalAmount) || totalAmount <= 0 || !paidBy) {
        alert("Please fill all expense fields correctly.");
        return;
    }

    var shares = {};
    var sumOfShares = 0;
    var isValidSplit = true;

    theGroup.members.forEach(function(member) {
        var shareInput = document.getElementById(`share-for-${member}`);
        var shareValue = parseFloat(shareInput.value) || 0;
        if (shareValue < 0) {
            isValidSplit = false;
        }
        shares[member] = shareValue;
        sumOfShares += shareValue;
    });
    
    sumOfShares = Math.round(sumOfShares * 100) / 100;

    if (!isValidSplit) {
        alert("Share amounts cannot be negative.");
        return;
    }

    if (sumOfShares !== totalAmount) {
        alert(`The sum of shares (${sumOfShares.toFixed(2)}) does not match the total amount (${totalAmount.toFixed(2)}).`);
        return;
    }

    var newExpense = {
        id: myAppStuff.nextExpenseId++,
        description: description,
        total: totalAmount,
        paidBy: paidBy,
        shares: shares
    };

    theGroup.expenses.push(newExpense);
    renderGroupDetail(groupId);
}

function deleteGroup(groupId) {
    if (confirm('Are you sure you want to delete this group?')) {
        myAppStuff.groups = myAppStuff.groups.filter(function(g) {
            return g.id !== groupId;
        });
        showGroupList();
    }
}

function calculateSummary(groupId) {
    var theGroup;
    for (var i = 0; i < myAppStuff.groups.length; i++) {
        if (myAppStuff.groups[i].id === groupId) {
            theGroup = myAppStuff.groups[i];
            break;
        }
    }
    if (!theGroup || theGroup.members.length === 0) return [];

    var balances = {};
    for (var j = 0; j < theGroup.members.length; j++) {
        var member = theGroup.members[j];
        balances[member] = 0;
    }
    
    theGroup.expenses.forEach(function(expense) {
        balances[expense.paidBy] += expense.total;
        theGroup.members.forEach(function(member) {
            balances[member] -= expense.shares[member] || 0;
        });
    });

    var debtors = [];
    var creditors = [];

    for (var person in balances) {
        if (balances[person] < 0) {
            debtors.push({ person: person, amount: balances[person] });
        } else if (balances[person] > 0) {
            creditors.push({ person: person, amount: balances[person] });
        }
    }
    
    var transactions = [];

    while (debtors.length > 0 && creditors.length > 0) {
        var debtor = debtors[0];
        var creditor = creditors[0];
        
        var amount = Math.min(-debtor.amount, creditor.amount);

        transactions.push({
            from: debtor.person,
            to: creditor.person,
            amount: amount
        });

        debtor.amount += amount;
        creditor.amount -= amount;

        if (Math.round(debtor.amount * 100) === 0) debtors.shift();
        if (Math.round(creditor.amount * 100) === 0) creditors.shift();
    }

    return transactions;
}

function renderGroupDetail(groupId) {
    var theGroup;
    for (var i = 0; i < myAppStuff.groups.length; i++) {
        if (myAppStuff.groups[i].id === groupId) {
            theGroup = myAppStuff.groups[i];
            break;
        }
    }
    if (!theGroup) return;

    var membersListHTML = theGroup.members.length > 0 ?
        theGroup.members.map(function(member) { return `<span class="bg-indigo-100 text-indigo-800 text-sm font-medium mr-2 px-2.5 py-0.5 rounded">${member}</span>` }).join('') :
        '<p class="text-gray-500">No members yet. Add one below.</p>';

    var paidByOptionsHTML = theGroup.members.map(function(member) { return `<option value="${member}">${member}</option>` }).join('');

    var customSplitHTML = theGroup.members.map(function(member) {
        return `
            <div class="flex items-center justify-between">
                <label for="share-for-${member}" class="text-gray-600">${member}'s share:</label>
                <input type="number" id="share-for-${member}" min="0" step="0.01" placeholder="0.00" class="w-2/5">
            </div>
        `;
    }).join('');
    
    var expensesListHTML = theGroup.expenses.length > 0 ?
        theGroup.expenses.slice().reverse().map(function(exp) {
            return `
                <li class="flex justify-between items-center p-3 border-b">
                    <div>
                        <p class="font-semibold text-gray-800">${exp.description}</p>
                        <p class="text-sm text-gray-500">Paid by ${exp.paidBy}</p>
                    </div>
                    <span class="font-bold text-lg text-gray-800">$${exp.total.toFixed(2)}</span>
                </li>
            `;
        }).join('') :
        '<p class="text-center text-gray-500 p-4">No expenses recorded for this group.</p>';

    var summary = calculateSummary(groupId);
    var summaryHTML = summary.length > 0 ?
        summary.map(function(t) {
            return `
                <li class="flex items-center justify-center p-3 bg-green-50 rounded-lg">
                    <span class="font-semibold text-green-800">${t.from}</span>
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mx-3 text-green-600" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd" /></svg>
                    <span class="font-semibold text-green-800">${t.to}</span>
                    <span class="ml-auto font-bold text-xl text-green-800">$${t.amount.toFixed(2)}</span>
                </li>
            `;
        }).join('') :
        '<p class="text-center text-gray-500 p-4">All settled up!</p>';

    var fullPageHTML = `
        <div class="space-y-6">
            <div class="flex justify-between items-center mb-4">
                <button onclick="showGroupList()" class="btn btn-secondary flex items-center"><svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clip-rule="evenodd" /></svg>Back to Groups</button>
                <h2 class="text-3xl font-bold text-gray-800">${theGroup.name}</h2>
                <button onclick="deleteGroup(${theGroup.id})" class="text-red-500 hover:text-red-700 font-semibold">Delete Group</button>
            </div>
            <div class="card p-6">
                <h3 class="text-xl font-semibold mb-4 text-gray-700">Group Members</h3>
                <div class="mb-4">${membersListHTML}</div>
                <div class="flex flex-col sm:flex-row gap-4">
                    <input type="text" id="add-member-input-${groupId}" placeholder="New member's name" class="flex-grow">
                    <button onclick="addMember(${groupId})" class="btn btn-secondary">Add Member</button>
                </div>
            </div>
            ${theGroup.members.length > 1 ? `
            <div class="card p-6">
                <h3 class="text-xl font-semibold mb-4 text-gray-700">Add New Expense</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="space-y-4">
                        <input type="text" id="expense-description" placeholder="Description (e.g., Dinner)">
                        <input type="number" id="expense-amount" placeholder="Total Amount" min="0.01" step="0.01">
                        <div>
                            <label for="expense-paid-by" class="block text-sm font-medium text-gray-700 mb-1">Paid by:</label>
                            <select id="expense-paid-by" class="w-full p-2 border border-gray-300 rounded-md">${paidByOptionsHTML}</select>
                        </div>
                    </div>
                    <div class="space-y-3 p-4 bg-gray-50 rounded-lg">
                        <h4 class="font-semibold text-center text-gray-600">Split The Bill</h4>
                        ${customSplitHTML}
                    </div>
                </div>
                <button onclick="addExpense(${groupId})" class="btn btn-primary w-full mt-6">Add Expense</button>
            </div>` : theGroup.members.length > 0 ? 
            `<div class="card p-6 text-center text-gray-500">Add one more member to start adding expenses.</div>` : ``
            }
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div class="card p-6">
                    <h3 class="text-xl font-semibold mb-4 text-gray-700">Summary</h3>
                    <ul class="space-y-2">${summaryHTML}</ul>
                </div>
                <div class="card p-6">
                    <h3 class="text-xl font-semibold mb-4 text-gray-700">Expense History</h3>
                    <ul class="space-y-2">${expensesListHTML}</ul>
                </div>
            </div>
        </div>`;
    
    groupDetailPage.innerHTML = fullPageHTML;
}

function init() {
    renderGroups();
}

init();