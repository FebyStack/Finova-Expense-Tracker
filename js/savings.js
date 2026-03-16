// js/savings.js
// Handles Savings Goals Modals (Create/Edit Goal, Add Contribution)

import { auth } from './firebase-config.js';
import { addSavingsGoal, editSavingsGoal, fetchSavingsGoals } from './api.js';

// Elements: Goal Modal
const modalSavings = document.getElementById('modalSavings');
const btnCloseSavingsModal = document.getElementById('btnCloseSavingsModal');
const btnCancelSavings = document.getElementById('btnCancelSavings');
const btnSaveSavings = document.getElementById('btnSaveSavings');
const savingsError = document.getElementById('savingsError');
const savingsErrorText = document.getElementById('savingsErrorText');

// Form inputs
const inputName = document.getElementById('savingsName');
const inputTarget = document.getElementById('savingsTarget');
const inputCurrent = document.getElementById('savingsCurrent');
const inputDeadline = document.getElementById('savingsDeadline');

// Elements: Contribution Modal
const modalAddContribution = document.getElementById('modalAddContribution');
const btnCloseContribModal = document.getElementById('btnCloseContribModal');
const btnCancelContrib = document.getElementById('btnCancelContrib');
const btnSaveContrib = document.getElementById('btnSaveContrib');
const contribError = document.getElementById('contribError');
const contribErrorText = document.getElementById('contribErrorText');

const contribGoalName = document.getElementById('contribGoalName');
const contribGoalId = document.getElementById('contribGoalId');
const inputContribAmount = document.getElementById('contribAmount');

let editingGoalId = null;

// ── Expose to Global scope for onclick ──
window.openSavingsModal = async (goalId = null) => {
  editingGoalId = goalId;
  savingsError.style.display = 'none';

  if (goalId) {
    document.getElementById('modalSavingsTitle').innerHTML = '<i class="fa-solid fa-piggy-bank" style="color:var(--accent);"></i> Edit Savings Goal';
    try {
      // Find goal
      const user = auth.currentUser;
      if (!user) return;
      const goals = await fetchSavingsGoals(user.uid);
      const goal = goals.find(g => g.id === goalId);
      if (goal) {
        inputName.value = goal.name || '';
        inputTarget.value = goal.target_amount || '';
        inputCurrent.value = goal.current_amount || '';
        inputDeadline.value = goal.deadline || '';
      }
    } catch (err) {
      console.error(err);
    }
  } else {
    document.getElementById('modalSavingsTitle').innerHTML = '<i class="fa-solid fa-piggy-bank" style="color:var(--accent);"></i> New Savings Goal';
    inputName.value = '';
    inputTarget.value = '';
    inputCurrent.value = '';
    inputDeadline.value = '';
  }

  modalSavings.classList.add('open');
};

window.closeSavingsModal = () => {
  modalSavings.classList.remove('open');
};

window.openContribModal = (goalId, goalName) => {
  contribError.style.display = 'none';
  contribGoalId.value = goalId;
  contribGoalName.textContent = goalName;
  inputContribAmount.value = '';
  modalAddContribution.classList.add('open');
};

window.closeContribModal = () => {
  modalAddContribution.classList.remove('open');
};

// ── Event Listeners ──

if (btnCloseSavingsModal) btnCloseSavingsModal.addEventListener('click', window.closeSavingsModal);
if (btnCancelSavings) btnCancelSavings.addEventListener('click', window.closeSavingsModal);

if (btnCloseContribModal) btnCloseContribModal.addEventListener('click', window.closeContribModal);
if (btnCancelContrib) btnCancelContrib.addEventListener('click', window.closeContribModal);

// Close on outside click
window.addEventListener('click', (e) => {
  if (e.target === modalSavings) window.closeSavingsModal();
  if (e.target === modalAddContribution) window.closeContribModal();
});

// Save Goal
if (btnSaveSavings) {
  btnSaveSavings.addEventListener('click', async () => {
    savingsError.style.display = 'none';
    const user = auth.currentUser;
    if (!user) return;

    const name = inputName.value.trim();
    const target = parseFloat(inputTarget.value);
    const current = parseFloat(inputCurrent.value) || 0;
    const deadline = inputDeadline.value || null;

    if (!name || isNaN(target) || target <= 0) {
      savingsErrorText.textContent = "Please provide a name and valid target amount.";
      savingsError.style.display = 'flex';
      return;
    }

    const goalData = {
      name,
      targetAmount: target,
      currentAmount: current,
      deadline
    };

    btnSaveSavings.disabled = true;
    btnSaveSavings.classList.add('loading');

    try {
      if (editingGoalId) {
        await editSavingsGoal(editingGoalId, user.uid, goalData);
      } else {
        await addSavingsGoal(user.uid, goalData);
      }
      
      window.closeSavingsModal();
      
      // Refresh list
      window.dispatchEvent(new Event('savingsUpdated'));
      
    } catch (err) {
      console.error(err);
      savingsErrorText.textContent = err.message || "Failed to save savings goal.";
      savingsError.style.display = 'flex';
    } finally {
      btnSaveSavings.disabled = false;
      btnSaveSavings.classList.remove('loading');
    }
  });
}

// Save Contribution
if (btnSaveContrib) {
  btnSaveContrib.addEventListener('click', async () => {
    contribError.style.display = 'none';
    const user = auth.currentUser;
    if (!user) return;

    const goalId = contribGoalId.value;
    const amount = parseFloat(inputContribAmount.value);

    if (!goalId || isNaN(amount) || amount <= 0) {
      contribErrorText.textContent = "Please enter a valid amount to contribute.";
      contribError.style.display = 'flex';
      return;
    }

    btnSaveContrib.disabled = true;
    btnSaveContrib.classList.add('loading');

    try {
      // 1. Fetch current goal data
      const goals = await fetchSavingsGoals(user.uid);
      const goal = goals.find(g => g.id == goalId); // loose equality for string/int IDs
      
      if (!goal) throw new Error("Goal not found.");

      const newCurrent = parseFloat(goal.current_amount || 0) + amount;

      // 2. Add to it
      await editSavingsGoal(goalId, user.uid, {
        currentAmount: newCurrent
      });

      window.closeContribModal();
      
      // Refresh list
      window.dispatchEvent(new Event('savingsUpdated'));

    } catch (err) {
      console.error(err);
      contribErrorText.textContent = err.message || "Failed to add contribution.";
      contribError.style.display = 'flex';
    } finally {
      btnSaveContrib.disabled = false;
      btnSaveContrib.classList.remove('loading');
    }
  });
}
