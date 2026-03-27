// js/calendar.js
// Day 22: Calendar View & Validation
import { auth, db } from './firebase-config.js';
import { collection, query, where, getDocs } from 'https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js';
import { fetchExpenses } from './api.js';
import { formatCurrency } from './currency.js';

let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

// ── Main Render Function ─────────────────────────────────────
export async function renderCalendar() {
  const user = auth.currentUser;
  const container = document.getElementById('calendarPageContainer');
  const banner = document.getElementById('calendarValidationBanner');
  if (!user || !container) return;

  container.innerHTML = '<div class="loading-state"><i class="fa-solid fa-spinner fa-spin"></i> Loading monthly data…</div>';
  banner.style.display = 'none';

  // The formatted month string (YYYY-MM) for API usage
  const monthStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;

  try {
    // 1. Fetch from PostgreSQL (Primary Backend via API)
    const pgExpenses = await fetchExpenses(user.uid, { month: monthStr });

    // 2. Fetch from Firestore (Validation/Legacy Backend)
    const fsRef = collection(db, 'expenses');
    const fsQuery = query(fsRef, where('uid', '==', user.uid));
    const fsSnapshot = await getDocs(fsQuery);
    const fsExpenses = [];
    fsSnapshot.forEach(doc => {
      const data = doc.data();
      // Filter by month string
      if (data.date && data.date.startsWith(monthStr)) {
        fsExpenses.push({ id: doc.id, ...data });
      }
    });

    // ── Validation Comparison ──
    const pgTotal = pgExpenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
    const fsTotal = fsExpenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
    
    // Check if matches
    const isMatched = pgExpenses.length === fsExpenses.length && Math.abs(pgTotal - fsTotal) < 0.01;
    
    banner.style.display = 'block';
    banner.className = `alert ${isMatched ? 'success' : 'warning'}`;
    banner.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; width: 100%;">
        <div>
          <strong><i class="fa-solid ${isMatched ? 'fa-check-circle' : 'fa-triangle-exclamation'}"></i> Database Validation:</strong> 
          ${isMatched ? 'PostgreSQL perfectly matches Firestore!' : 'Discrepancy detected between Postgres and Firestore.'}
        </div>
        <div style="font-size: 12px; text-align:right;">
          <strong>PG:</strong> ${pgExpenses.length} records (${formatCurrency(pgTotal, window.userCurrency)})<br/>
          <strong>FS:</strong> ${fsExpenses.length} records (${formatCurrency(fsTotal, window.userCurrency)})
        </div>
      </div>
    `;

    // ── Build Heatmap Data (using Primary PG data) ──
    const dailySpend = {};
    let maxSpend = 0;
    
    pgExpenses.forEach(e => {
      const day = parseInt(e.date.split('-')[2], 10);
      dailySpend[day] = (dailySpend[day] || 0) + (parseFloat(e.amount) || 0);
      if (dailySpend[day] > maxSpend) {
        maxSpend = dailySpend[day];
      }
    });

    // ── Build Calendar UI ──
    buildCalendarGrid(container, dailySpend, maxSpend);

  } catch (err) {
    console.error('Calendar rendering error:', err);
    container.innerHTML = `<div class="list-empty text-danger">Failed to load calendar: ${err.message}</div>`;
  }
}

// ── Build Grid ─────────────────────────────────────────────
function buildCalendarGrid(container, dailySpend, maxSpend) {
  // Navigation Header
  let html = `
    <div class="calendar-header">
      <button class="btn btn-ghost" id="calPrev"><i class="fa-solid fa-chevron-left"></i></button>
      <h2 class="calendar-title">${MONTHS[currentMonth]} ${currentYear}</h2>
      <button class="btn btn-ghost" id="calNext"><i class="fa-solid fa-chevron-right"></i></button>
    </div>
  `;

  // Weekdays
  html += `<div class="calendar-grid weekdays">`;
  DAYS.forEach(d => {
    html += `<div class="calendar-weekday">${d}</div>`;
  });
  html += `</div>`;

  // Days Grid
  html += `<div class="calendar-grid days">`;

  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const today = new Date();
  const isCurrentMonth = today.getMonth() === currentMonth && today.getFullYear() === currentYear;

  // Empty cells for offset
  for (let i = 0; i < firstDay; i++) {
    html += `<div class="calendar-cell empty"></div>`;
  }

  // Day cells
  for (let day = 1; day <= daysInMonth; day++) {
    const spend = dailySpend[day] || 0;
    const isToday = isCurrentMonth && today.getDate() === day;
    
    // Determine heat map intensity (0 to 5)
    let heatLevel = 0;
    if (spend > 0) {
      if (maxSpend === 0) heatLevel = 1;
      else {
        // Break into 5 buckets (20%, 40%, 60%, 80%, 100%)
        const ratio = spend / maxSpend;
        heatLevel = Math.ceil(ratio * 5);
        if (heatLevel > 5) heatLevel = 5;
        if (heatLevel < 1) heatLevel = 1;
      }
    }

    const heatClass = heatLevel > 0 ? `heat-${heatLevel}` : '';
    const todayClass = isToday ? 'today' : '';
    const spendLabel = spend > 0 ? formatCurrency(spend, window.userCurrency) : '';

    html += `
      <div class="calendar-cell ${heatClass} ${todayClass}" title="${spendLabel}">
        <div class="calendar-day-num">${day}</div>
        <div class="calendar-day-spend">${spendLabel}</div>
      </div>
    `;
  }

  html += `</div>`;
  
  // Heatmap Legend
  html += `
    <div class="calendar-legend">
      <span style="font-size:12px; color:var(--text-muted); margin-right:8px;">Less spend</span>
      <div class="legend-box heat-0"></div>
      <div class="legend-box heat-1"></div>
      <div class="legend-box heat-2"></div>
      <div class="legend-box heat-3"></div>
      <div class="legend-box heat-4"></div>
      <div class="legend-box heat-5"></div>
      <span style="font-size:12px; color:var(--text-muted); margin-left:8px;">More spend</span>
    </div>
  `;

  container.innerHTML = html;

  // Bind Events
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

// ── Auto-load ───────────────────────────────────────────────
window.addEventListener('calendarUpdated', () => renderCalendar());

const onHash = () => {
  if (window.location.hash === '#calendar') renderCalendar();
};
window.addEventListener('hashchange', onHash);

if (window.location.hash === '#calendar') {
  auth.onAuthStateChanged(user => { if (user) renderCalendar(); });
}
