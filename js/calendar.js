// js/calendar.js
// Day 22-23: Calendar View, Heatmap & Day Detail
import { auth, db } from './firebase-config.js';
import { collection, query, where, getDocs } from 'https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js';
import { fetchExpenses, fetchIncome } from './api.js';
import { getCategoryStyle } from './categories.js';
import { formatCurrency } from './currency.js';

let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();
let currentMonthExpenses = []; // Cache to power day detail modal
let calendarViewMode = 'expenses'; // 'expenses', 'income', 'net'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

// ── Main Render Function ─────────────────────────────────────
export async function renderCalendar() {
  const user = auth.currentUser;
  const container = document.getElementById('calendarPageContainer');
  if (!user || !container) return;

  container.innerHTML = '<div class="loading-state"><i class="fa-solid fa-spinner fa-spin"></i> Loading monthly data…</div>';

  const monthStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;

  try {
    // 1. Fetch expenses
    let pgExpenses = [];
    try { pgExpenses = await fetchExpenses(user.uid, { month: monthStr }); } 
    catch (e) { console.warn('PG expense fetch failed:', e); }
    currentMonthExpenses = pgExpenses; // cache for day detail logic

    // 2. Fetch income (only if mode requires it to save bandwidth)
    let pgIncome = [];
    if (calendarViewMode === 'income' || calendarViewMode === 'net') {
      try { pgIncome = await fetchIncome(user.uid, { month: monthStr }); } 
      catch (e) { console.warn('PG income fetch failed:', e); }
    }

    // ── Build Heatmap Data ──
    const dailySpend = {};
    let maxSpend = 0;
    let minSpend = 0; // for net view which can be negative

    // Aggregate expenses
    if (calendarViewMode === 'expenses' || calendarViewMode === 'net') {
      pgExpenses.forEach(e => {
        const day = parseInt(e.date.split('-')[2], 10);
        dailySpend[day] = (dailySpend[day] || 0) - (parseFloat(e.amount) || 0);
      });
    }

    // Aggregate income
    if (calendarViewMode === 'income' || calendarViewMode === 'net') {
      pgIncome.forEach(i => {
        const day = parseInt(i.date.split('-')[2], 10);
        dailySpend[day] = (dailySpend[day] || 0) + (parseFloat(i.amount) || 0);
      });
    }

    // Convert values based on mode for display
    Object.keys(dailySpend).forEach(day => {
      let val = dailySpend[day];
      if (calendarViewMode === 'expenses') val = Math.abs(val); // show as positive
      dailySpend[day] = val;

      if (val > maxSpend) maxSpend = val;
      if (val < minSpend) minSpend = val; // for net mode baseline
    });

    // ── Build Calendar UI ──
    buildCalendarGrid(container, dailySpend, maxSpend, minSpend);

  } catch (err) {
    console.error('Calendar rendering error:', err);
    container.innerHTML = `<div class="list-empty text-danger"><i class="fa-solid fa-circle-exclamation"></i> Failed to load calendar: ${err.message}</div>`;
  }
}

// ── Build Grid ─────────────────────────────────────────────
function buildCalendarGrid(container, dailySpend, maxSpend, minSpend) {
  const monthStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
  const currency = window.userCurrency || 'PHP';

  let html = `
    <div class="calendar-header cal-header-top" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--space-4);">
      <div style="display:flex; align-items:center; gap:var(--space-4);">
        <button class="btn btn-ghost" id="calPrev"><i class="fa-solid fa-chevron-left"></i></button>
        <h2 class="calendar-title">${MONTHS[currentMonth]} ${currentYear}</h2>
        <button class="btn btn-ghost" id="calNext"><i class="fa-solid fa-chevron-right"></i></button>
      </div>
      
      <div class="cal-view-toggle">
        <button class="cal-view-btn ${calendarViewMode === 'expenses' ? 'active' : ''}" onclick="window.setCalendarMode('expenses')">Expenses</button>
        <button class="cal-view-btn ${calendarViewMode === 'income' ? 'active' : ''}" onclick="window.setCalendarMode('income')">Income</button>
        <button class="cal-view-btn ${calendarViewMode === 'net' ? 'active' : ''}" onclick="window.setCalendarMode('net')">Net</button>
      </div>
    </div>
  `;

  // Weekdays (8 columns)
  html += `<div class="calendar-grid weekdays">`;
  DAYS.forEach(d => { html += `<div class="calendar-weekday">${d}</div>`; });
  html += `<div class="calendar-weekday week-total">Total</div>`;
  html += `</div>`;

  // Days Grid
  html += `<div class="calendar-grid days">`;

  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const today = new Date();
  const isCurrentMonth = today.getMonth() === currentMonth && today.getFullYear() === currentYear;

  let currentWeekTotal = 0;
  let currentWeekdayIndex = firstDay;

  // Empty cells for offset
  for (let i = 0; i < firstDay; i++) {
    html += `<div class="calendar-cell empty"></div>`;
  }

  // Day cells
  for (let day = 1; day <= daysInMonth; day++) {
    const spend = dailySpend[day] || 0;
    currentWeekTotal += spend;
    const isToday = isCurrentMonth && today.getDate() === day;

    let heatLevel = 0;
    if (calendarViewMode === 'net') {
      // For net, positive is green (income), negative is red (expense). We map intensity mostly on absolute max
      if (spend !== 0) {
        const absVal = Math.abs(spend);
        const absMax = Math.max(Math.abs(maxSpend), Math.abs(minSpend));
        if (absMax > 0) heatLevel = Math.ceil((absVal / absMax) * 5);
      }
    } else {
      if (spend > 0 && maxSpend > 0) heatLevel = Math.ceil((spend / maxSpend) * 5);
    }
    if (heatLevel > 5) heatLevel = 5;

    let heatClass = '';
    if (calendarViewMode === 'net' && spend < 0) heatClass = `heat-${heatLevel}`; // Red text logic handled by default
    else if (calendarViewMode === 'net' && spend > 0) heatClass = `heat-${heatLevel}`; // TODO: Green heat
    else if (heatLevel > 0) heatClass = `heat-${heatLevel}`;

    // Specific styling for net/income
    let cellStyle = '';
    if (calendarViewMode === 'income' && heatLevel > 0) {
      // Override to green for income
      heatClass = '';
      cellStyle = `background: rgba(34, 197, 94, ${heatLevel * 0.2}); border-color: rgba(34, 197, 94, ${heatLevel * 0.3});`;
    } else if (calendarViewMode === 'net') {
      heatClass = '';
      if (spend > 0) cellStyle = `background: rgba(34, 197, 94, ${heatLevel * 0.2});`;
      if (spend < 0) cellStyle = `background: rgba(239, 68, 68, ${heatLevel * 0.2});`;
    }

    const todayClass = isToday ? 'today' : '';
    const spendLabel = spend !== 0 ? formatCurrency(spend, currency) : '';
    const dateStr = `${monthStr}-${String(day).padStart(2, '0')}`;

    html += `
      <div class="calendar-cell ${heatClass} ${todayClass} clickable" style="${cellStyle}" title="${spendLabel}" onclick="window.openDayDetail('${dateStr}')">
        <div class="calendar-day-num">${day}</div>
        <div class="calendar-day-spend">${spendLabel}</div>
      </div>
    `;

    currentWeekdayIndex++;
    
    // Add Weekly Total Cell at end of week (Saturday = index 7)
    if (currentWeekdayIndex === 7 || day === daysInMonth) {
      // pad empty cells to end of week if it's month end
      while (currentWeekdayIndex < 7) {
        html += `<div class="calendar-cell empty"></div>`;
        currentWeekdayIndex++;
      }
      
      const totalLabel = currentWeekTotal !== 0 ? formatCurrency(currentWeekTotal, currency) : '';
      let totalColor = '';
      if (calendarViewMode === 'net') {
        totalColor = currentWeekTotal > 0 ? 'color:var(--success)' : (currentWeekTotal < 0 ? 'color:var(--danger)' : '');
      }

      html += `<div class="calendar-cell week-total">
                 <div class="calendar-day-spend" style="${totalColor}">${totalLabel}</div>
               </div>`;
      
      currentWeekTotal = 0;
      currentWeekdayIndex = 0;
    }
  }

  html += `</div>`;

  // Sparkline Chart (Day 24)
  const absMax = Math.max(Math.abs(maxSpend), Math.abs(minSpend), 1);
  let sparkHtml = `<div class="cal-sparkline-container">
    <div class="cal-sparkline-title">Daily ${calendarViewMode.charAt(0).toUpperCase() + calendarViewMode.slice(1)} Trend</div>
    <div class="cal-sparkline">
  `;
  for(let day = 1; day <= daysInMonth; day++) {
    const val = dailySpend[day] || 0;
    const heightPct = val === 0 ? 0 : Math.max(5, (Math.abs(val) / absMax) * 100);
    const label = val !== 0 ? formatCurrency(val, currency) : '₱0.00';
    
    let barColor = 'var(--accent)'; // default expense
    if (calendarViewMode === 'income') barColor = 'var(--success)';
    if (calendarViewMode === 'net') barColor = val >= 0 ? 'var(--success)' : 'var(--danger)';

    sparkHtml += `
      <div class="cal-spark-bar-wrap">
        <div class="cal-spark-tooltip">${day} ${MONTHS[currentMonth].substring(0,3)}<br>${label}</div>
        <div class="cal-spark-bar" style="height:0px; background:${barColor};" data-height="${heightPct}%"></div>
      </div>
    `;
  }
  sparkHtml += `</div></div>`;
  html += sparkHtml;

  container.innerHTML = html;

  // Trigger sparkline animations on next frame
  requestAnimationFrame(() => {
    document.querySelectorAll('.cal-spark-bar').forEach(bar => {
      bar.style.height = bar.dataset.height;
    });
  });

  // Bind Prev/Next Events
  document.getElementById('calPrev').addEventListener('click', () => {
    currentMonth--;
    if (currentMonth < 0) { currentMonth = 11; currentYear--; }
    renderCalendar();
  });

  document.getElementById('calNext').addEventListener('click', () => {
    currentMonth++;
    if (currentMonth > 11) { currentMonth = 0; currentYear++; }
    renderCalendar();
  });
}

// ── View Mode Toggle ────────────────────────────────────────
window.setCalendarMode = function(mode) {
  if (calendarViewMode === mode) return;
  calendarViewMode = mode;
  renderCalendar();
};

// ── Day Detail Modal ────────────────────────────────────────
window.openDayDetail = function(dateStr) {
  const overlay = document.getElementById('dayDetailOverlay');
  const title = document.getElementById('dayDetailTitle');
  const total = document.getElementById('dayDetailTotal');
  const list = document.getElementById('dayDetailList');
  if (!overlay || !list) return;

  // Parse date for display
  const [yr, mo, dy] = dateStr.split('-');
  const d = new Date(parseInt(yr), parseInt(mo) - 1, parseInt(dy));
  title.innerText = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });

  // Filter transactions for selected day
  const dayTx = currentMonthExpenses.filter(e => e.date === dateStr);
  const currency = window.userCurrency || 'PHP';
  const daySum = dayTx.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
  total.innerText = formatCurrency(daySum, currency);

  if (dayTx.length === 0) {
    list.innerHTML = `<div class="list-empty" style="padding:var(--space-6); text-align:center;">
      <i class="fa-solid fa-receipt" style="font-size:24px; color:var(--text-muted); margin-bottom:8px; display:block;"></i>
      No transactions logged for this day.
    </div>`;
  } else {
    let html = '';
    dayTx.forEach(tx => {
      const style = getCategoryStyle(tx.category);
      let receiptHtml = '';
      if (tx.receipt_data) {
        try {
          const rData = typeof tx.receipt_data === 'string' ? JSON.parse(tx.receipt_data) : tx.receipt_data;
          if (rData && rData.items && rData.items.length) {
            const itemsList = rData.items.map(i => `<li>${i}</li>`).join('');
            receiptHtml = `
              <div class="receipt-dropdown-wrapper" style="margin-top:4px;">
                <span class="receipt-badge"><i class="fa-solid fa-receipt"></i> items</span>
                <div class="receipt-dropdown">
                  <div class="rd-merchant">${rData.merchant || 'Unknown Merchant'}</div>
                  <ul class="rd-items">${itemsList}</ul>
                </div>
              </div>
            `;
          }
        } catch(e) {}
      }

      html += `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:var(--space-3); border-bottom:1px solid var(--border);">
          <div style="display:flex; align-items:flex-start; gap:var(--space-3);">
            <div style="background:${style.bg}; color:${style.color}; width:36px; height:36px; border-radius:10px; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
              <i class="${style.icon}"></i>
            </div>
            <div>
              <div style="font-weight:var(--weight-semibold); color:var(--text-primary); margin-bottom:2px;">${tx.category || 'Uncategorized'}</div>
              <div style="font-size:11px; color:var(--text-muted);">${tx.note || ''}</div>
              ${receiptHtml}
            </div>
          </div>
          <div style="font-weight:var(--weight-bold); color:var(--accent); white-space:nowrap; margin-left:var(--space-3);">
            ${formatCurrency(parseFloat(tx.amount), currency)}
          </div>
        </div>
      `;
    });
    list.innerHTML = html;
  }

  overlay.classList.add('open');
};

window.closeDayDetail = function() {
  document.getElementById('dayDetailOverlay')?.classList.remove('open');
};

// Close modal on backdrop click
document.addEventListener('click', (e) => {
  const overlay = document.getElementById('dayDetailOverlay');
  if (overlay && e.target === overlay) {
    overlay.classList.remove('open');
  }
});

// ── Auto-load ───────────────────────────────────────────────
window.addEventListener('calendarUpdated', () => renderCalendar());

window.addEventListener('hashchange', () => {
  if (window.location.hash === '#calendar') renderCalendar();
});

if (window.location.hash === '#calendar') {
  auth.onAuthStateChanged(user => { if (user) renderCalendar(); });
}
