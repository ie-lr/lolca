/**
 * app.js
 * -----------------------------------------------------------------------
 * Main Application Controller for Light of Life Christian Academy (LOLCA).
 * Handles authentication, 2FA, Admin/Teacher Workstation with left pane,
 * Card Tabs dashboard, dynamic grades per subject, fees & payment auto-balance,
 * and exact 2-page report cards and receipts generation.
 * -----------------------------------------------------------------------
 */

document.addEventListener('DOMContentLoaded', () => {
  LOLCA_APP.init();
});

const LOLCA_APP = (function() {
  const state = {
    currentUser: null,
    userType: null, // 'admin' | 'teacher' | 'student'
    activeTab: 'dashboard',
    studentsCache: [],
    adminsCache: [],
    auditLogsCache: [],
    selectedStudentForReport: null,
    selectedStudentForPayment: null,
    pending2FA: { email: '', tempToken: '', countdown: 60, timer: null },
    slideshowIndex: 0,
    slideshowTimer: null
  };

  const SLIDESHOW_IMAGES = [
    'assets/images/65fa9b9a-2d1a-4e1e-995e-66f1dfc8fc0e.jfif',
    'assets/images/4238c817-2e37-4eea-9a6d-7181f86554f3.jfif',
    'assets/images/8079ddd5-119b-4b66-ad29-b01647b3a402.jfif',
    'assets/images/859d8505-eba4-4a8c-89a2-3dbb2a9b77c5.jfif',
    'assets/images/a7ad9bcb-5da6-4515-9703-cdac8306fb0f.jfif',
    'assets/images/WhatsApp Image 2026-07-10 at 10.52.31 AM.jpeg'
  ];

  /* =======================================================================
     INITIALIZATION & SESSION RESTORATION
     ======================================================================= */
  function init() {
    initSlideshow();
    setupEventHandlers();
    checkExistingSession();
  }

  function initSlideshow() {
    const container = document.getElementById('bgSlideshow');
    if (!container) return;
    container.innerHTML = '';
    SLIDESHOW_IMAGES.forEach((src, idx) => {
      const slide = document.createElement('div');
      slide.className = 'slide' + (idx === 0 ? ' active' : '');
      slide.style.backgroundImage = `url('${src}')`;
      container.appendChild(slide);
    });

    if (state.slideshowTimer) clearInterval(state.slideshowTimer);
    state.slideshowTimer = setInterval(() => {
      const slides = container.querySelectorAll('.slide');
      if (!slides.length) return;
      slides[state.slideshowIndex].classList.remove('active');
      state.slideshowIndex = (state.slideshowIndex + 1) % slides.length;
      slides[state.slideshowIndex].classList.add('active');
    }, 5500);
  }

  function checkExistingSession() {
    const user = API.getCurrentUser();
    const token = API.getSessionToken();

    if (user && token) {
      state.currentUser = user;
      if (user.role === 'Teacher') {
        state.userType = 'teacher';
        showAdminWorkstation();
      } else if (user.role || user.permissions) {
        state.userType = 'admin';
        showAdminWorkstation();
      } else if (user.studentId) {
        state.userType = 'student';
        showStudentPortal();
      } else {
        showGateway();
      }
    } else {
      showGateway();
    }
  }

  function showGateway() {
    hideAllViews();
    const gateway = document.getElementById('viewGateway');
    if (gateway) gateway.classList.remove('hidden');
  }

  function showAdminWorkstation() {
    hideAllViews();
    const workstation = document.getElementById('viewAdminWorkstation');
    if (workstation) {
      workstation.classList.remove('hidden');
      updateAdminProfileHeader();
      applyTeacherRoleRestrictions();
      switchTab(state.activeTab || 'dashboard');
    }
  }

  function showStudentPortal() {
    hideAllViews();
    const portal = document.getElementById('viewStudentPortal');
    if (portal) {
      portal.classList.remove('hidden');
      updateStudentHeader();
      loadStudentPortalData();
    }
  }

  function hideAllViews() {
    ['viewGateway', 'viewAdminWorkstation', 'viewStudentPortal'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });
  }

  /* =======================================================================
     TEACHER PERMISSION RESTRICTIONS
     ======================================================================= */
  function applyTeacherRoleRestrictions() {
    const isTeacher = state.currentUser && state.currentUser.role === 'Teacher';
    const assignedClasses = (state.currentUser && state.currentUser.assignedClasses) || ['all'];
    const assignedSubjects = (state.currentUser && state.currentUser.assignedSubjects) || ['all'];

    // Hide admin-only tabs for teachers
    document.querySelectorAll('[data-admin-only="true"]').forEach(el => {
      if (isTeacher) el.classList.add('hidden');
      else el.classList.remove('hidden');
    });

    const roleBadge = document.getElementById('sidebarUserRole');
    if (roleBadge) {
      roleBadge.textContent = isTeacher ? 'Teacher' : (state.currentUser.role || 'Administrator');
    }
  }

  function getAccessibleClasses() {
    const all = window.APP_CONFIG.classes || [];
    if (!state.currentUser || state.currentUser.role !== 'Teacher') return all;
    const assigned = state.currentUser.assignedClasses || [];
    if (assigned.includes('all')) return all;
    return all.filter(c => assigned.includes(c));
  }

  function getAccessibleSubjects(selectedClass) {
    const isPreschool = (window.APP_CONFIG.preschoolClasses || []).includes(selectedClass);
    const curriculum = isPreschool ? window.APP_CONFIG.preschoolCurriculum : window.APP_CONFIG.elementaryCurriculum;
    let allSubjects = [];
    Object.values(curriculum).forEach(list => { allSubjects = allSubjects.concat(list); });

    if (!state.currentUser || state.currentUser.role !== 'Teacher') return allSubjects;
    const assigned = state.currentUser.assignedSubjects || [];
    if (assigned.includes('all')) return allSubjects;
    return allSubjects.filter(s => assigned.includes(s));
  }

  /* =======================================================================
     GATEWAY & AUTHENTICATION
     ======================================================================= */
  function setupEventHandlers() {
    // Gateway Tabs
    const tabAdminBtn = document.getElementById('tabGatewayAdmin');
    const tabStudentBtn = document.getElementById('tabGatewayStudent');
    const formAdmin = document.getElementById('formAdminLogin');
    const formStudent = document.getElementById('formStudentLogin');

    if (tabAdminBtn && tabStudentBtn) {
      tabAdminBtn.addEventListener('click', () => {
        tabAdminBtn.classList.add('active');
        tabStudentBtn.classList.remove('active');
        formAdmin.classList.remove('hidden');
        formStudent.classList.add('hidden');
      });
      tabStudentBtn.addEventListener('click', () => {
        tabStudentBtn.classList.add('active');
        tabAdminBtn.classList.remove('active');
        formStudent.classList.remove('hidden');
        formAdmin.classList.add('hidden');
      });
    }

    // Admin/Teacher login form
    if (formAdmin) {
      formAdmin.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('adminEmail').value.trim();
        const password = document.getElementById('adminPassword').value;
        const rememberMe = document.getElementById('adminRememberMe') ? document.getElementById('adminRememberMe').checked : false;

        const res = await API.request('adminLogin', { email, password });
        if (!res.success) {
          API.toastError(res.message || 'Invalid credentials.');
          return;
        }

        if (res.requires2FA) {
          state.pending2FA = { email, tempToken: res.tempToken, rememberMe, countdown: 60 };
          open2FAModal(res.message);
        } else {
          API.setSessionToken(res.sessionToken, rememberMe);
          API.setCurrentUser(res.user, rememberMe);
          state.currentUser = res.user;
          state.userType = res.user.role === 'Teacher' ? 'teacher' : 'admin';
          API.toastSuccess(`Welcome, ${res.user.fullName}!`);
          showAdminWorkstation();
        }
      });
    }

    // Student login form
    if (formStudent) {
      formStudent.addEventListener('submit', async (e) => {
        e.preventDefault();
        const studentId = document.getElementById('studentIdInput').value.trim();
        const res = await API.request('studentLogin', { studentId });
        if (!res.success) {
          API.toastError(res.message || 'Student ID not recognized.');
          return;
        }

        API.setSessionToken(res.sessionToken, false);
        API.setCurrentUser(res.student, false);
        state.currentUser = res.student;
        state.userType = 'student';
        API.toastSuccess(`Welcome, ${res.student.fullName}!`);
        showStudentPortal();
      });
    }

    // 2FA OTP auto advance
    setupOtpInputListeners();

    // 2FA Form submit
    const form2FA = document.getElementById('formVerify2FA');
    if (form2FA) {
      form2FA.addEventListener('submit', async (e) => {
        e.preventDefault();
        const code = getOtpValue();
        if (code.length < 6) {
          API.toastError('Please enter the complete 6-digit code.');
          return;
        }
        const res = await API.request('verify2FA', {
          email: state.pending2FA.email,
          tempToken: state.pending2FA.tempToken,
          code: code
        });
        if (!res.success) {
          API.toastError(res.message || 'Invalid 2FA code.');
          return;
        }

        closeModal('modal2FA');
        API.setSessionToken(res.sessionToken, state.pending2FA.rememberMe);
        API.setCurrentUser(res.user, state.pending2FA.rememberMe);
        state.currentUser = res.user;
        state.userType = res.user.role === 'Teacher' ? 'teacher' : 'admin';
        API.toastSuccess(`2FA Verified. Welcome, ${res.user.fullName}!`);
        showAdminWorkstation();
      });
    }

    // Resend 2FA
    const btnResend2FA = document.getElementById('btnResend2FA');
    if (btnResend2FA) {
      btnResend2FA.addEventListener('click', async () => {
        if (state.pending2FA.countdown > 0) return;
        const res = await API.request('adminLogin', { email: state.pending2FA.email, password: 'resend' });
        if (res.success && res.requires2FA) {
          state.pending2FA.tempToken = res.tempToken;
          state.pending2FA.countdown = 60;
          start2FACountdown();
          API.toastSuccess('Verification code resent!');
        }
      });
    }

    // Logout
    document.querySelectorAll('.btn-logout').forEach(btn => {
      btn.addEventListener('click', handleLogout);
    });

    // Sidebar navigation items
    document.querySelectorAll('.sidebar-nav-item').forEach(item => {
      item.addEventListener('click', () => {
        const tab = item.getAttribute('data-tab');
        if (tab) switchTab(tab);
      });
    });

    // Card Tabs on Dashboard
    document.querySelectorAll('.action-card-tile').forEach(tile => {
      tile.addEventListener('click', () => {
        const tab = tile.getAttribute('data-target-tab');
        if (tab) switchTab(tab);
      });
    });

    // Top Nav "Go To Dashboard" button
    const btnGoDashboard = document.getElementById('btnGoDashboard');
    if (btnGoDashboard) {
      btnGoDashboard.addEventListener('click', () => switchTab('dashboard'));
    }

    // Students filter / search
    const sSearch = document.getElementById('studentSearch');
    const sClassFilter = document.getElementById('studentClassFilter');
    if (sSearch) sSearch.addEventListener('input', debounce(loadStudentsTable, 250));
    if (sClassFilter) sClassFilter.addEventListener('change', loadStudentsTable);

    // Add Student form
    const formAddStudent = document.getElementById('formAddStudent');
    if (formAddStudent) formAddStudent.addEventListener('submit', handleAddStudentSubmit);

    // Add Admin form
    const formAddAdmin = document.getElementById('formAddAdmin');
    if (formAddAdmin) formAddAdmin.addEventListener('submit', handleAddAdminSubmit);

    // Grades Selectors
    const gradesClass = document.getElementById('gradesSelectClass');
    const gradesSubject = document.getElementById('gradesSelectSubject');
    if (gradesClass) {
      gradesClass.addEventListener('change', updateGradesSubjectOptions);
    }
    const btnLoadMarksheet = document.getElementById('btnLoadMarksheet');
    if (btnLoadMarksheet) btnLoadMarksheet.addEventListener('click', loadClassMarksheet);

    // Payment student select
    const payStudentSelect = document.getElementById('paymentStudentSelect');
    if (payStudentSelect) {
      payStudentSelect.addEventListener('change', (e) => {
        loadStudentPaymentSheet(e.target.value);
      });
    }
    const formRecordPayment = document.getElementById('formRecordPayment');
    if (formRecordPayment) formRecordPayment.addEventListener('submit', handleRecordPaymentSubmit);

    // Report Card student select
    const reportStudentSelect = document.getElementById('reportStudentSelect');
    if (reportStudentSelect) {
      reportStudentSelect.addEventListener('change', (e) => {
        generateOfficialReportCard(e.target.value);
      });
    }

    // Modal Close
    document.querySelectorAll('[data-close-modal]').forEach(btn => {
      btn.addEventListener('click', () => {
        const modalId = btn.getAttribute('data-close-modal');
        if (modalId) closeModal(modalId);
      });
    });
  }

  function handleLogout() {
    API.clearSession();
    state.currentUser = null;
    state.userType = null;
    API.toastSuccess('Signed out successfully.');
    showGateway();
  }

  /* =======================================================================
     TAB SWITCHING & VIEW CONTROLLERS
     ======================================================================= */
  function switchTab(tabName) {
    state.activeTab = tabName;

    // Update active sidebar item
    document.querySelectorAll('.sidebar-nav-item').forEach(item => {
      if (item.getAttribute('data-tab') === tabName) item.classList.add('active');
      else item.classList.remove('active');
    });

    // Hide all tab panes
    ['tabDashboard', 'tabStudents', 'tabGrades', 'tabPayments', 'tabReports', 'tabAdmins', 'tabAudit', 'tabSettings'].forEach(id => {
      const pane = document.getElementById(id);
      if (pane) pane.classList.add('hidden');
    });

    const targetMap = {
      dashboard: 'tabDashboard',
      students: 'tabStudents',
      grades: 'tabGrades',
      payments: 'tabPayments',
      reports: 'tabReports',
      admins: 'tabAdmins',
      audit: 'tabAudit',
      settings: 'tabSettings'
    };

    const targetId = targetMap[tabName];
    const pane = document.getElementById(targetId);
    if (pane) pane.classList.remove('hidden');

    // Trigger tab loader
    switch (tabName) {
      case 'dashboard':
        loadDashboardStats();
        break;
      case 'students':
        populateStudentClassFilter();
        loadStudentsTable();
        break;
      case 'grades':
        initGradesSelectors();
        break;
      case 'payments':
        initPaymentsSection();
        break;
      case 'reports':
        initReportsSection();
        break;
      case 'admins':
        loadAdminsTable();
        break;
      case 'audit':
        loadAuditLogsTable();
        break;
      case 'settings':
        loadSettingsView();
        break;
    }
  }

  function updateAdminProfileHeader() {
    const user = state.currentUser || {};
    const nameEl = document.getElementById('sidebarUserName');
    const roleEl = document.getElementById('sidebarUserRole');
    if (nameEl) nameEl.textContent = user.fullName || user.email || 'Admin User';
    if (roleEl) roleEl.textContent = user.role || 'Staff Admin';
  }

  /* =======================================================================
     DASHBOARD TAB
     ======================================================================= */
  async function loadDashboardStats() {
    const resS = await API.request('getStudents', { search: '', class: 'All' }, 'GET');
    const totalStudents = resS.success ? resS.total : 0;

    const resA = await API.request('getAdmins', {}, 'GET');
    const totalAdmins = resA.success ? (resA.admins ? resA.admins.length : 0) : 0;

    const statS = document.getElementById('statTotalStudents');
    if (statS) statS.textContent = totalStudents;

    const statA = document.getElementById('statTotalAdmins');
    if (statA) statA.textContent = totalAdmins;

    loadRecentActivityFeed();
  }

  async function loadRecentActivityFeed() {
    const listEl = document.getElementById('dashboardActivityList');
    if (!listEl) return;
    const res = await API.request('getAuditLogs', {}, 'GET');
    if (res.success && res.logs && res.logs.length) {
      listEl.innerHTML = res.logs.slice(-6).reverse().map(log => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid #e2e8f0; font-size:13px;">
          <div>
            <strong>${escapeHtml(log.action)}</strong>: <span class="text-muted">${escapeHtml(log.details || '')}</span>
            <div style="font-size:11px; color:#64748b;">Actor: ${escapeHtml(log.actor)} | Target: ${escapeHtml(log.target || '')}</div>
          </div>
          <span style="font-size:11px; font-family:monospace; color:#64748b;">${formatTime(log.timestamp)}</span>
        </div>
      `).join('');
    } else {
      listEl.innerHTML = '<div class="text-muted" style="padding:12px 0;">No logs recorded yet.</div>';
    }
  }

  /* =======================================================================
     STUDENT MANAGEMENT
     ======================================================================= */
  function populateStudentClassFilter() {
    const filter = document.getElementById('studentClassFilter');
    const modalSelect = document.getElementById('inpStudentClass');
    const classes = getAccessibleClasses();

    if (filter) {
      filter.innerHTML = '<option value="All">All Grade Levels</option>' +
        classes.map(c => `<option value="${c}">${c}</option>`).join('');
    }
    if (modalSelect) {
      modalSelect.innerHTML = (window.APP_CONFIG.classes || []).map(c => `<option value="${c}">${c}</option>`).join('');
    }
  }

  async function loadStudentsTable() {
    const search = document.getElementById('studentSearch') ? document.getElementById('studentSearch').value.trim() : '';
    const selectedClass = document.getElementById('studentClassFilter') ? document.getElementById('studentClassFilter').value : 'All';

    const tbody = document.getElementById('studentsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted" style="padding:24px;">Loading student records...</td></tr>';

    const res = await API.request('getStudents', { search, class: selectedClass }, 'GET');
    if (!res.success) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted" style="padding:24px; color:#ef4444;">${res.message || 'Error'}</td></tr>`;
      return;
    }

    state.studentsCache = res.students || [];
    const countBadge = document.getElementById('studentCountBadge');
    if (countBadge) countBadge.textContent = `${state.studentsCache.length} enrolled`;

    if (!state.studentsCache.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted" style="padding:28px;">No matching students found.</td></tr>';
      return;
    }

    tbody.innerHTML = state.studentsCache.map(s => `
      <tr>
        <td>
          <div style="display:flex; align-items:center; gap:10px;">
            <img src="${s.photoUrl || 'assets/icons/circle-user-round.png'}" 
                 style="width:34px; height:34px; border-radius:50%; object-fit:cover; border:1px solid #cbd5e1;"
                 onerror="this.src='assets/icons/circle-user-round.png'">
            <div>
              <span class="font-bold">${escapeHtml(s.fullName)}</span>
              <div style="font-size:11px; color:#64748b;">${escapeHtml(s.gender || '')}</div>
            </div>
          </div>
        </td>
        <td><code style="background:#f1f5f9; padding:2px 6px; border-radius:4px; font-weight:700;">${escapeHtml(s.studentId)}</code></td>
        <td><span class="font-semibold">${escapeHtml(s.class)}</span></td>
        <td>${escapeHtml(s.guardianName || 'N/A')}</td>
        <td>${escapeHtml(s.guardianPhone || 'N/A')}</td>
        <td><span style="display:inline-block; padding:2px 8px; border-radius:12px; font-size:11px; font-weight:700; background:#dcfce7; color:#15803d;">${escapeHtml(s.status || 'Active')}</span></td>
        <td>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-secondary btn-sm" onclick="LOLCA_APP.viewStudentReportCard('${s.studentId}')" title="Official Report Card">
              <img src="assets/icons/file-text.png" class="sys-icon" alt="Report">
            </button>
            <button class="btn btn-secondary btn-sm" onclick="LOLCA_APP.viewStudentPayments('${s.studentId}')" title="Payments & Receipt">
              <img src="assets/icons/landmark.png" class="sys-icon" alt="Receipt">
            </button>
            <button class="btn btn-secondary btn-sm" onclick="LOLCA_APP.openEditStudentModal('${s.studentId}')" title="Edit Student">
              <img src="assets/icons/pencil.png" class="sys-icon" alt="Edit">
            </button>
            <button class="btn btn-danger btn-sm" onclick="LOLCA_APP.confirmDeleteStudent('${s.studentId}', '${escapeHtml(s.fullName)}')" title="Delete Student">
              <img src="assets/icons/delete.png" class="sys-icon" alt="Delete">
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  function openAddStudentModal() {
    const form = document.getElementById('formAddStudent');
    if (form) form.reset();
    document.getElementById('modalAddStudentTitle').textContent = 'Enroll New Student';
    document.getElementById('editStudentOriginalId').value = '';
    openModal('modalAddStudent');
  }

  function openEditStudentModal(studentId) {
    const s = state.studentsCache.find(st => st.studentId === studentId);
    if (!s) return;
    document.getElementById('modalAddStudentTitle').textContent = `Edit Student: ${s.fullName}`;
    document.getElementById('editStudentOriginalId').value = s.studentId;
    document.getElementById('inpStudentId').value = s.studentId;
    document.getElementById('inpStudentName').value = s.fullName;
    document.getElementById('inpStudentClass').value = s.class;
    document.getElementById('inpStudentGender').value = s.gender || 'Male';
    document.getElementById('inpStudentDob').value = s.dob || '';
    document.getElementById('inpGuardianName').value = s.guardianName || '';
    document.getElementById('inpGuardianPhone').value = s.guardianPhone || '';
    document.getElementById('inpGuardianEmail').value = s.guardianEmail || '';
    document.getElementById('inpStudentAddress').value = s.address || '';
    document.getElementById('inpStudentStatus').value = s.status || 'Active';
    openModal('modalAddStudent');
  }

  async function handleAddStudentSubmit(e) {
    e.preventDefault();
    const originalId = document.getElementById('editStudentOriginalId').value;
    const isEdit = Boolean(originalId);

    const payload = {
      studentId: document.getElementById('inpStudentId').value.trim() || undefined,
      fullName: document.getElementById('inpStudentName').value.trim(),
      class: document.getElementById('inpStudentClass').value,
      gender: document.getElementById('inpStudentGender').value,
      dob: document.getElementById('inpStudentDob').value,
      guardianName: document.getElementById('inpGuardianName').value.trim(),
      guardianPhone: document.getElementById('inpGuardianPhone').value.trim(),
      guardianEmail: document.getElementById('inpGuardianEmail').value.trim(),
      address: document.getElementById('inpStudentAddress').value.trim(),
      status: document.getElementById('inpStudentStatus').value
    };

    if (isEdit) payload.studentId = originalId;
    const action = isEdit ? 'updateStudent' : 'addStudent';
    const res = await API.request(action, payload);
    if (!res.success) {
      API.toastError(res.message || 'Operation failed.');
      return;
    }
    closeModal('modalAddStudent');
    API.toastSuccess(isEdit ? 'Student updated.' : 'Student enrolled.');
    loadStudentsTable();
  }

  function confirmDeleteStudent(studentId, fullName) {
    if (confirm(`Remove student ${fullName} (${studentId}) from registry?`)) {
      API.request('deleteStudent', { studentId }).then(res => {
        if (res.success) {
          API.toastSuccess('Student removed.');
          loadStudentsTable();
        } else {
          API.toastError(res.message);
        }
      });
    }
  }

  /* =======================================================================
     GRADES ENTRY & MARKSHEET (PER STUDENT PER SUBJECT)
     ======================================================================= */
  function initGradesSelectors() {
    const classSel = document.getElementById('gradesSelectClass');
    const classes = getAccessibleClasses();
    if (classSel) {
      classSel.innerHTML = classes.map(c => `<option value="${c}">${c}</option>`).join('');
      if (classes.length) classSel.value = classes[0];
    }
    updateGradesSubjectOptions();
    loadClassMarksheet();
  }

  function updateGradesSubjectOptions() {
    const classSel = document.getElementById('gradesSelectClass');
    const subjSel = document.getElementById('gradesSelectSubject');
    if (!classSel || !subjSel) return;
    const subjects = getAccessibleSubjects(classSel.value);
    subjSel.innerHTML = subjects.map(s => `<option value="${s}">${s}</option>`).join('');
  }

  async function loadClassMarksheet() {
    const className = document.getElementById('gradesSelectClass').value;
    const subject = document.getElementById('gradesSelectSubject').value;

    const tbody = document.getElementById('marksheetTableBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="12" class="text-center text-muted" style="padding:24px;">Loading marksheet...</td></tr>';

    // Get students in this class
    const resS = await API.request('getStudents', { class: className }, 'GET');
    const students = resS.students || [];

    if (!students.length) {
      tbody.innerHTML = `<tr><td colspan="12" class="text-center text-muted" style="padding:24px;">No students enrolled in ${escapeHtml(className)}.</td></tr>`;
      return;
    }

    // Build row for each student for this subject
    tbody.innerHTML = students.map((s, idx) => `
      <tr data-student-id="${s.studentId}">
        <td><strong>${escapeHtml(s.fullName)}</strong><br><small class="text-muted">${s.studentId}</small></td>
        <td><input type="number" min="0" max="100" class="input-field p-inp" data-field="p1" style="width:58px; text-align:center; padding:5px;" value="88"></td>
        <td><input type="number" min="0" max="100" class="input-field p-inp" data-field="p2" style="width:58px; text-align:center; padding:5px;" value="89"></td>
        <td><input type="number" min="0" max="100" class="input-field p-inp" data-field="p3" style="width:58px; text-align:center; padding:5px;" value="91"></td>
        <td><input type="number" min="0" max="100" class="input-field p-inp" data-field="ex1" style="width:58px; text-align:center; padding:5px;" value="92"></td>
        <td><input type="number" min="0" max="100" class="input-field p-inp" data-field="p4" style="width:58px; text-align:center; padding:5px;" value="90"></td>
        <td><input type="number" min="0" max="100" class="input-field p-inp" data-field="p5" style="width:58px; text-align:center; padding:5px;" value="93"></td>
        <td><input type="number" min="0" max="100" class="input-field p-inp" data-field="p6" style="width:58px; text-align:center; padding:5px;" value="94"></td>
        <td><input type="number" min="0" max="100" class="input-field p-inp" data-field="ex2" style="width:58px; text-align:center; padding:5px;" value="95"></td>
        <td>
          <button type="button" class="btn btn-primary btn-sm" onclick="LOLCA_APP.saveSingleStudentGrade('${s.studentId}', '${escapeHtml(subject)}', this)">
            Save
          </button>
        </td>
      </tr>
    `).join('');
  }

  async function saveSingleStudentGrade(studentId, subject, btn) {
    const tr = btn.closest('tr');
    if (!tr) return;

    const payload = {
      studentId: studentId,
      subject: subject,
      p1: tr.querySelector('[data-field="p1"]').value,
      p2: tr.querySelector('[data-field="p2"]').value,
      p3: tr.querySelector('[data-field="p3"]').value,
      ex1: tr.querySelector('[data-field="ex1"]').value,
      p4: tr.querySelector('[data-field="p4"]').value,
      p5: tr.querySelector('[data-field="p5"]').value,
      p6: tr.querySelector('[data-field="p6"]').value,
      ex2: tr.querySelector('[data-field="ex2"]').value,
      recordedBy: state.currentUser ? state.currentUser.email : 'Admin'
    };

    const res = await API.request('saveStudentSubjectGrade', payload);
    if (res.success) {
      API.toastSuccess(`Grades saved for ${subject}!`);
    } else {
      API.toastError(res.message || 'Could not save grade.');
    }
  }

  /* =======================================================================
     FEES & PAYMENT TRACKING (EXACT RECEIPT MATCHING IMAGE 6)
     ======================================================================= */
  async function initPaymentsSection() {
    const sel = document.getElementById('paymentStudentSelect');
    if (!sel) return;

    const res = await API.request('getStudents', { search: '', class: 'All' }, 'GET');
    const students = res.students || [];

    sel.innerHTML = '<option value="">-- Choose Student to View Payments & Issue Receipt --</option>' +
      students.map(s => `<option value="${s.studentId}">${s.fullName} (${s.class} - ${s.studentId})</option>`).join('');

    if (students.length) {
      sel.value = students[0].studentId;
      loadStudentPaymentSheet(students[0].studentId);
    }
  }

  async function loadStudentPaymentSheet(studentId) {
    if (!studentId) return;
    state.selectedStudentForPayment = studentId;

    const container = document.getElementById('paymentSheetContainer');
    if (!container) return;
    container.innerHTML = '<div class="text-center text-muted" style="padding:32px;">Loading payment history...</div>';

    const res = await API.request('getStudentPayments', { studentId: studentId });
    if (!res.success) {
      container.innerHTML = `<div class="text-center text-muted" style="padding:32px; color:#ef4444;">${res.message}</div>`;
      return;
    }

    const st = res.student;
    const fee = res.feeStructure;
    const sm = res.summary;
    const tPay = res.tuitionPayments || [];
    const oPay = res.otherPayments || [];

    // Pre-fill payment modal fields
    const mStudentId = document.getElementById('recordPayStudentId');
    const mClass = document.getElementById('recordPayClass');
    const mBal = document.getElementById('recordPayBalance');
    if (mStudentId) mStudentId.value = st.studentId;
    if (mClass) mClass.value = `${st.class} (Total Fees: $${fee.totalFees})`;
    if (mBal) mBal.value = `$${sm.balanceDue}`;

    container.innerHTML = `
      <div class="payment-receipt-sheet">
        <!-- Header with Dual Crests as in Reference Image 6 -->
        <div class="receipt-header-row">
          <img src="assets/images/LOLCA logo circle shape.png" alt="LOLCA Crest" class="receipt-logo-crest">
          <div class="receipt-header-text">
            <h2>LIGHT OF LIFE CHRISTIAN ACADEMY (LOLCA)</h2>
            <div class="receipt-location-info">
              Wakor Junction, Light Community, Jlazon, Lower Margibi / Montserrado County, Republic of Liberia<br>
              Tel: 0778240169 / 0886383455 / 0777908308<br>
              Email: bavidngombu15@gmail.com | WhatsApp: 0776277517
            </div>
          </div>
          <img src="assets/images/LOLCA logo circle shape.png" alt="LOLCA Crest" class="receipt-logo-crest">
        </div>

        <div class="receipt-yellow-divider"></div>

        <!-- Title Box -->
        <div class="receipt-section-box-title">
          STUDENT PAYMENTS INFORMATION TRACKING
        </div>

        <!-- Student Meta Table -->
        <table class="receipt-student-meta-table">
          <tr>
            <td style="width:50%;">STUDENT NAME: <span style="font-weight:normal; margin-left:8px;">${escapeHtml(st.fullName)}</span></td>
            <td style="width:50%;">CLASS: <span style="font-weight:normal; margin-left:8px;">${escapeHtml(st.class)}</span></td>
          </tr>
          <tr>
            <td>PARENT / GUARDIAN: <span style="font-weight:normal; margin-left:8px;">${escapeHtml(st.guardianName || 'N/A')}</span></td>
            <td>COUNT. (PHONE): <span style="font-weight:normal; margin-left:8px;">${escapeHtml(st.guardianPhone || 'N/A')}</span></td>
          </tr>
        </table>

        <!-- Box 1: Tuition Fees -->
        <div class="receipt-section-box-title">
          PARENT INFORMATION (TUITION FEES)
        </div>

        <table class="receipt-items-table">
          <thead>
            <tr>
              <th style="width:110px;">DATE</th>
              <th>PAYMENT DESCRIPTION</th>
              <th style="width:110px;">RECEIPT #</th>
              <th style="width:90px;">AMOUNT</th>
              <th>COMMENTS</th>
            </tr>
          </thead>
          <tbody>
            ${tPay.length ? tPay.map(p => `
              <tr>
                <td>${escapeHtml(p.date)}</td>
                <td>${escapeHtml(p.paymentDescription)}</td>
                <td><code style="font-weight:700;">${escapeHtml(p.receiptNumber)}</code></td>
                <td>$${p.amount}</td>
                <td>${escapeHtml(p.comments || '-')}</td>
              </tr>
            `).join('') : `
              <tr><td colspan="5" class="text-center text-muted" style="padding:10px;">No tuition payments entered yet.</td></tr>
            `}
          </tbody>
        </table>

        <!-- Box 2: Other Payments -->
        <div class="receipt-section-box-title">
          OTHER PAYMENTS EXCLUDING TUITION FEES
        </div>

        <table class="receipt-items-table">
          <thead>
            <tr>
              <th style="width:110px;">DATE</th>
              <th>PAYMENT DESCRIPTION</th>
              <th style="width:110px;">RECEIPT #</th>
              <th style="width:90px;">AMOUNT</th>
              <th>COMMENT</th>
            </tr>
          </thead>
          <tbody>
            ${oPay.length ? oPay.map(p => `
              <tr>
                <td>${escapeHtml(p.date)}</td>
                <td>${escapeHtml(p.paymentDescription)}</td>
                <td><code style="font-weight:700;">${escapeHtml(p.receiptNumber)}</code></td>
                <td>$${p.amount}</td>
                <td>${escapeHtml(p.comments || '-')}</td>
              </tr>
            `).join('') : `
              <tr><td colspan="5" class="text-center text-muted" style="padding:10px;">No other fee payments recorded.</td></tr>
            `}
          </tbody>
        </table>

        <!-- Financial Summary Grid -->
        <div class="receipt-financial-summary-grid">
          <div>
            <div class="summary-stat-val">$${sm.totalFeesAssessed}</div>
            <div class="summary-stat-lbl">Class Total Fees</div>
          </div>
          <div>
            <div class="summary-stat-val" style="color:#15803d;">$${sm.grandTotalPaid}</div>
            <div class="summary-stat-lbl">Total Amount Paid</div>
          </div>
          <div>
            <div class="summary-stat-val" style="color:${sm.balanceDue > 0 ? '#b91c1c' : '#15803d'};">
              $${sm.balanceDue}
            </div>
            <div class="summary-stat-lbl">Balance Remaining</div>
          </div>
        </div>

        <!-- Actions in UI -->
        <div class="no-print" style="margin-top:20px; display:flex; justify-content:flex-end; gap:10px;">
          <button type="button" class="btn btn-secondary" onclick="window.print()">
            <img src="assets/icons/download (2).png" class="sys-icon" alt="Print">
            Print Official Receipt
          </button>
          <button type="button" class="btn btn-primary" onclick="LOLCA_APP.openRecordPaymentModal()">
            <img src="assets/icons/square-dashed-plus.png" class="sys-icon" alt="Add">
            Record New Payment
          </button>
        </div>
      </div>
    `;
  }

  function openRecordPaymentModal() {
    openModal('modalRecordPayment');
  }

  async function handleRecordPaymentSubmit(e) {
    e.preventDefault();
    const studentId = document.getElementById('recordPayStudentId').value;
    const paymentType = document.getElementById('recordPayType').value;
    const amount = Number(document.getElementById('recordPayAmount').value);
    const desc = document.getElementById('recordPayDesc').value.trim();
    const receiptNum = document.getElementById('recordPayReceiptNum').value.trim();
    const comments = document.getElementById('recordPayComments').value.trim();

    if (!studentId || !amount || amount <= 0) {
      API.toastError('Please enter a valid payment amount.');
      return;
    }

    const payload = {
      studentId: studentId,
      paymentType: paymentType,
      amount: amount,
      paymentDescription: desc || `${paymentType} Payment`,
      receiptNumber: receiptNum || undefined,
      comments: comments,
      recordedBy: state.currentUser ? state.currentUser.email : 'Admin'
    };

    const res = await API.request('recordPayment', payload);
    if (res.success) {
      closeModal('modalRecordPayment');
      API.toastSuccess(`Payment of $${amount} recorded! Balance updated.`);
      loadStudentPaymentSheet(studentId);
    } else {
      API.toastError(res.message || 'Error recording payment.');
    }
  }

  /* =======================================================================
     REPORT CARDS (EXACT 2-PAGE BOOKLET MATCHING IMAGES 1, 2, 3, 4)
     ======================================================================= */
  async function initReportsSection() {
    const sel = document.getElementById('reportStudentSelect');
    if (!sel) return;

    const res = await API.request('getStudents', { search: '', class: 'All' }, 'GET');
    const students = res.students || [];

    sel.innerHTML = '<option value="">-- Choose Student to View & Print Report Card --</option>' +
      students.map(s => `<option value="${s.studentId}">${s.fullName} (${s.class} - ${s.studentId})</option>`).join('');

    if (students.length) {
      sel.value = students[0].studentId;
      generateOfficialReportCard(students[0].studentId);
    }
  }

  async function generateOfficialReportCard(studentId) {
    if (!studentId) return;
    state.selectedStudentForReport = studentId;

    const container = document.getElementById('reportCardBookletContainer');
    if (!container) return;
    container.innerHTML = '<div class="text-center text-muted" style="padding:32px;">Generating official report card...</div>';

    const res = await API.request('getStudentGradeReport', { studentId: studentId });
    if (!res.success) {
      container.innerHTML = `<div class="text-center text-muted" style="padding:32px; color:#ef4444;">${res.message}</div>`;
      return;
    }

    const st = res.student;
    const isPre = res.isPreschool;
    const cats = res.categories || [];
    const att = res.attendance || {};
    const sm = res.summary || {};

    container.innerHTML = `
      <div class="report-booklet-wrapper">
        <div class="no-print" style="width:100%; max-width:950px; display:flex; justify-content:space-between; align-items:center;">
          <h3 style="font-size:16px; font-weight:800; color:#1e293b;">
            Official 2-Page Half A4 Report Card - ${escapeHtml(st.fullName)} (${escapeHtml(st.class)})
          </h3>
          <button type="button" class="btn btn-secondary" onclick="window.print()">
            <img src="assets/icons/download (2).png" class="sys-icon" alt="Print">
            Print / Save as PDF
          </button>
        </div>

        <!-- ==========================================
             PAGE 1: COVER & PROMOTION STATEMENT
             ========================================== -->
        <div class="report-page-sheet">
          <div class="report-cover-grid">
            <!-- Left: Promotion Statement -->
            <div class="cover-left-box">
              <div>
                <div class="promotion-title">Promotion Statement</div>
                <div class="promotion-statement-text">
                  This certifies that <span class="blank-fill-line">${escapeHtml(st.fullName)}</span><br><br>
                  Has / <del>Has not</del> satisfactorily completed the work of<br><br>
                  Grade <span class="blank-fill-line">${escapeHtml(st.class)}</span> and is<br><br>
                  A. Promoted to Grade <span class="blank-fill-line">${escapeHtml(sm.promotionGrade || 'Next Grade')}</span><br><br>
                  B. Condition in <span class="blank-fill-line" style="min-width:180px;">&nbsp;</span><br>
                  &nbsp;&nbsp;&nbsp;&nbsp;And to be giving conditional examination in these subject at the opening of the next term.<br><br>
                  C. Required to repeat the grade<br><br>
                  D. Asked not to returned (NTR)
                </div>
              </div>

              <div style="margin-top:30px;">
                <div style="border-top:1px solid #000000; width:220px; margin-bottom:24px; text-align:center; font-size:12px; font-weight:700;">
                  CLASS SPONSOR
                </div>
                <div style="border-top:1px solid #000000; width:220px; margin-bottom:24px; text-align:center; font-size:12px; font-weight:700;">
                  PRINCIPAL
                </div>
                <div style="font-size:12.5px;">
                  Date <span class="blank-fill-line" style="min-width:100px;">${new Date().toLocaleDateString()}</span> 20<span class="blank-fill-line" style="min-width:30px;">26</span>
                </div>
              </div>
            </div>

            <!-- Right: Cover Crest, Title & Parent Signatures Table -->
            <div class="cover-right-box">
              <div class="cover-header-row">
                <img src="assets/images/LOLCA logo circle shape.png" alt="LOLCA Crest" class="cover-shield-crest">
                <div class="cover-header-text">
                  <h3>LIGHT OF LIFE CHRISTIAN ACADEMY (LOLCA)</h3>
                  <div class="cover-contact-text">
                    Light Community, Jlazon, Lower Margibi<br>
                    Republic of Liberia<br>
                    Tel: 0778240169 / 0886383455 / 0777908308<br>
                    Email: bavidngombu15@gmail.com<br>
                    WhatsApp Number: 0776277517
                  </div>
                </div>
              </div>

              <div class="report-main-badge-title">
                ${isPre ? 'PRE-GRADE REPORT CARD' : 'ELEMENTARY REPORT CARD'}
              </div>

              <div style="font-size:13px; line-height:1.9; margin-bottom:12px;">
                Student's Name <span class="blank-fill-line" style="min-width:240px;">${escapeHtml(st.fullName)}</span><br>
                Grade: <span class="blank-fill-line" style="min-width:90px;">${escapeHtml(st.class)}</span>&nbsp;&nbsp;&nbsp;&nbsp;School Year: <span class="blank-fill-line" style="min-width:90px;">2025-2026</span>
              </div>

              <div class="parents-guardian-heading">PARENTS OR GUARDIAN</div>
              <div class="parents-guardian-sub">Must sign here each period as evidence that they have seen the period report</div>

              <table class="period-signatures-table">
                <thead>
                  <tr>
                    <th style="width:60px;">Period</th>
                    <th style="width:130px;">Class Teacher</th>
                    <th>Parents/ Guardian</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td>I</td><td>Signed</td><td></td></tr>
                  <tr><td>II</td><td></td><td></td></tr>
                  <tr><td>III</td><td></td><td></td></tr>
                  <tr><td>IV</td><td></td><td></td></tr>
                  <tr><td>V</td><td></td><td></td></tr>
                  <tr><td>VI</td><td></td><td></td></tr>
                </tbody>
              </table>

              <div class="cover-warning-note">
                <strong>Note:</strong> When a student's mark is 70 or below 70 in any subject, the Parent or Guardian should give special attention to see that the student does well in all the work required by the school; otherwise the student will probably fail.
              </div>
            </div>
          </div>
        </div>

        <!-- ==========================================
             PAGE 2: INSIDE MARKS TABLE
             ========================================== -->
        <div class="report-page-sheet">
          <div class="report-marks-grid">
            <!-- Left: First Semester -->
            <table class="semester-marks-table">
              <thead>
                <tr>
                  <th colspan="6" class="sem-header-title">FIRST SEMESTER</th>
                </tr>
                <tr>
                  <th style="width:40%;">SUBJECT</th>
                  <th style="width:12%;">1<sup>st</sup></th>
                  <th style="width:12%;">2<sup>nd</sup></th>
                  <th style="width:12%;">3<sup>rd</sup></th>
                  <th style="width:12%;">Ex.</th>
                  <th style="width:12%;">SEM. Ave</th>
                </tr>
              </thead>
              <tbody>
                ${cats.map(c => `
                  <tr>
                    <td colspan="6" class="category-header-row">${escapeHtml(c.category)}</td>
                  </tr>
                  ${c.rows.map(r => `
                    <tr>
                      <td class="subj-name-cell">${escapeHtml(r.subject)}</td>
                      <td>${r.p1}</td>
                      <td>${r.p2}</td>
                      <td>${r.p3}</td>
                      <td>${r.ex1}</td>
                      <td><strong>${r.sem1Ave}</strong></td>
                    </tr>
                  `).join('')}
                `).join('')}
              </tbody>
            </table>

            <!-- Right: Second Semester -->
            <table class="semester-marks-table">
              <thead>
                <tr>
                  <th colspan="6" class="sem-header-title">SECOND SEMESTER</th>
                </tr>
                <tr>
                  <th style="width:16%;">4<sup>th</sup></th>
                  <th style="width:16%;">5<sup>th</sup></th>
                  <th style="width:16%;">6<sup>th</sup></th>
                  <th style="width:16%;">EX.</th>
                  <th style="width:18%;">SEM. Ave</th>
                  <th style="width:18%;">Yr. Ave</th>
                </tr>
              </thead>
              <tbody>
                ${cats.map(c => `
                  <tr>
                    <td colspan="6" class="category-header-row">${escapeHtml(c.category)}</td>
                  </tr>
                  ${c.rows.map(r => `
                    <tr>
                      <td>${r.p4}</td>
                      <td>${r.p5}</td>
                      <td>${r.p6}</td>
                      <td>${r.ex2}</td>
                      <td><strong>${r.sem2Ave}</strong></td>
                      <td><strong style="color:#0284c7;">${r.yrAve}</strong></td>
                    </tr>
                  `).join('')}
                `).join('')}
              </tbody>
            </table>
          </div>

          <!-- Bottom: Conduct & Grading Key -->
          ${isPre ? `
            <div style="font-size:11px; margin-top:14px; text-align:center; font-style:italic;">
              <strong>Method of Grading:</strong><br>
              A+ - = Excellent (95-100); A- = Very good (85-94); B+ = Good (80-84); B- = Fair (75-79); C = Needs Improvement (70-74); D = Poor (60-69)
            </div>
          ` : `
            <div class="conduct-attendance-box">
              <div>
                <strong>Conduct:</strong> &nbsp;&nbsp;
                [ ${att.conduct === 'Very Good' ? '&#10003;' : ' '} ] Very Good &nbsp;&nbsp;&nbsp;&nbsp;
                [ ${att.conduct === 'Good' ? '&#10003;' : ' '} ] Good &nbsp;&nbsp;&nbsp;&nbsp;
                [ ${att.conduct === 'Needs to improve' ? '&#10003;' : ' '} ] Needs to improve
              </div>
              <div>
                <strong>Time Absent:</strong> ${att.absentDays || 0} Day(s) &nbsp;&nbsp;&nbsp;&nbsp;
                <strong>Time Tardy:</strong> ${att.tardyDays || 0} Day(s)
              </div>
            </div>
          `}
        </div>
      </div>
    `;
  }

  function viewStudentReportCard(studentId) {
    switchTab('reports');
    const sel = document.getElementById('reportStudentSelect');
    if (sel) sel.value = studentId;
    generateOfficialReportCard(studentId);
  }

  function viewStudentPayments(studentId) {
    switchTab('payments');
    const sel = document.getElementById('paymentStudentSelect');
    if (sel) sel.value = studentId;
    loadStudentPaymentSheet(studentId);
  }

  /* =======================================================================
     STUDENT PORTAL DATA CONTROLLER
     ======================================================================= */
  function updateStudentHeader() {
    const st = state.currentUser;
    if (!st) return;
    const nameEl = document.getElementById('studentPortalName');
    const classEl = document.getElementById('studentPortalClass');
    if (nameEl) nameEl.textContent = st.fullName;
    if (classEl) classEl.textContent = `${st.class} • ID: ${st.studentId}`;
  }

  async function loadStudentPortalData() {
    const st = state.currentUser;
    if (!st) return;

    // Load student's report card
    generateStudentOwnReportCard(st.studentId);
    // Load student's payment receipts
    loadStudentOwnPaymentSheet(st.studentId);
  }

  async function generateStudentOwnReportCard(studentId) {
    const container = document.getElementById('studentOwnReportCardTarget');
    if (!container) return;
    const res = await API.request('getStudentGradeReport', { studentId: studentId });
    if (!res.success) {
      container.innerHTML = `<div class="text-center text-muted" style="padding:24px;">Grade report not published yet.</div>`;
      return;
    }

    // Reuse the 2-page report card rendering
    const targetDiv = document.createElement('div');
    targetDiv.id = 'reportCardBookletContainer';
    container.innerHTML = '';
    container.appendChild(targetDiv);
    generateOfficialReportCard(studentId);
  }

  async function loadStudentOwnPaymentSheet(studentId) {
    const container = document.getElementById('studentOwnReceiptTarget');
    if (!container) return;
    const targetDiv = document.createElement('div');
    targetDiv.id = 'paymentSheetContainer';
    container.innerHTML = '';
    container.appendChild(targetDiv);
    loadStudentPaymentSheet(studentId);
  }

  /* =======================================================================
     ADMIN & TEACHER MANAGEMENT
     ======================================================================= */
  async function loadAdminsTable() {
    const tbody = document.getElementById('adminsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted" style="padding:24px;">Loading staff accounts...</td></tr>';

    const res = await API.request('getAdmins', {}, 'GET');
    if (!res.success) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted" style="padding:24px; color:#ef4444;">Access restricted.</td></tr>`;
      return;
    }

    state.adminsCache = res.admins || [];
    tbody.innerHTML = state.adminsCache.map(a => {
      const isSuper = a.email.toLowerCase() === 'chrisnentorbor@gmail.com';
      const classes = Array.isArray(a.assignedClasses) ? a.assignedClasses.join(', ') : (a.assignedClasses || 'All');
      const subjects = Array.isArray(a.assignedSubjects) ? a.assignedSubjects.join(', ') : (a.assignedSubjects || 'All');

      return `
        <tr>
          <td>
            <strong>${escapeHtml(a.fullName || a.email)}</strong>
            <div style="font-size:11px; color:#64748b;">${escapeHtml(a.email)}</div>
          </td>
          <td><span class="font-semibold">${escapeHtml(a.role)}</span></td>
          <td><span style="font-size:12px; font-weight:600; color:#0284c7;">${escapeHtml(classes)}</span></td>
          <td><span style="font-size:12px; color:#475569;">${escapeHtml(subjects)}</span></td>
          <td>
            <span style="display:inline-block; padding:2px 8px; border-radius:12px; font-size:11px; font-weight:700; background:${a.requires2FA ? '#dcfce7' : '#f1f5f9'}; color:${a.requires2FA ? '#15803d' : '#475569'};">
              ${a.requires2FA ? '2FA Active' : 'Standard'}
            </span>
          </td>
          <td>
            <span style="display:inline-block; padding:2px 8px; border-radius:12px; font-size:11px; font-weight:700; background:#dcfce7; color:#15803d;">
              ${escapeHtml(a.status || 'Active')}
            </span>
          </td>
          <td>
            ${isSuper ? '<span class="text-muted" style="font-size:11px; font-style:italic;">Primary Super Admin</span>' : `
              <div style="display:flex; gap:6px;">
                <button class="btn btn-secondary btn-sm" onclick="LOLCA_APP.openEditAdminModal('${a.adminId}')" title="Edit Staff & Assignment">
                  <img src="assets/icons/pencil.png" class="sys-icon" alt="Edit">
                </button>
                <button class="btn btn-danger btn-sm" onclick="LOLCA_APP.confirmDeleteAdmin('${a.adminId}', '${escapeHtml(a.email)}')" title="Delete Staff">
                  <img src="assets/icons/delete.png" class="sys-icon" alt="Delete">
                </button>
              </div>
            `}
          </td>
        </tr>
      `;
    }).join('');
  }

  function openAddAdminModal() {
    const form = document.getElementById('formAddAdmin');
    if (form) form.reset();
    document.getElementById('modalAddAdminTitle').textContent = 'Add Administrator or Teacher';
    document.getElementById('editAdminOriginalId').value = '';

    // Populate class checkboxes
    const classContainer = document.getElementById('teacherClassesCheckboxes');
    if (classContainer) {
      classContainer.innerHTML = (window.APP_CONFIG.classes || []).map(c => `
        <label style="display:inline-flex; align-items:center; gap:6px; font-size:12px; margin-right:12px; margin-bottom:6px;">
          <input type="checkbox" class="chk-teacher-class" value="${c}">
          <span>${c}</span>
        </label>
      `).join('');
    }

    openModal('modalAddAdmin');
  }

  function openEditAdminModal(adminId) {
    const admin = state.adminsCache.find(a => a.adminId === adminId);
    if (!admin) return;

    document.getElementById('modalAddAdminTitle').textContent = `Edit Staff: ${admin.fullName}`;
    document.getElementById('editAdminOriginalId').value = admin.adminId;
    document.getElementById('inpAdminEmail').value = admin.email;
    document.getElementById('inpAdminFullName').value = admin.fullName;
    document.getElementById('inpAdminRole').value = admin.role;
    document.getElementById('inpAdminPhone').value = admin.phone || '';
    document.getElementById('inpAdmin2FA').checked = Boolean(admin.requires2FA);

    const classContainer = document.getElementById('teacherClassesCheckboxes');
    if (classContainer) {
      const assigned = admin.assignedClasses || [];
      classContainer.innerHTML = (window.APP_CONFIG.classes || []).map(c => `
        <label style="display:inline-flex; align-items:center; gap:6px; font-size:12px; margin-right:12px; margin-bottom:6px;">
          <input type="checkbox" class="chk-teacher-class" value="${c}" ${assigned.includes('all') || assigned.includes(c) ? 'checked' : ''}>
          <span>${c}</span>
        </label>
      `).join('');
    }

    document.getElementById('inpTeacherSubjects').value = Array.isArray(admin.assignedSubjects) ? admin.assignedSubjects.join(', ') : (admin.assignedSubjects || '');

    openModal('modalAddAdmin');
  }

  async function handleAddAdminSubmit(e) {
    e.preventDefault();
    const originalId = document.getElementById('editAdminOriginalId').value;
    const isEdit = Boolean(originalId);

    const assignedClasses = [];
    document.querySelectorAll('.chk-teacher-class:checked').forEach(chk => {
      assignedClasses.push(chk.value);
    });

    const subjsInput = document.getElementById('inpTeacherSubjects').value.trim();
    const assignedSubjects = subjsInput ? subjsInput.split(',').map(s => s.trim()).filter(Boolean) : ['all'];

    const payload = {
      adminId: originalId || undefined,
      email: document.getElementById('inpAdminEmail').value.trim().toLowerCase(),
      fullName: document.getElementById('inpAdminFullName').value.trim(),
      role: document.getElementById('inpAdminRole').value,
      password: document.getElementById('inpAdminPassword').value || undefined,
      phone: document.getElementById('inpAdminPhone').value.trim(),
      requires2FA: document.getElementById('inpAdmin2FA').checked,
      assignedClasses: assignedClasses.length ? assignedClasses : ['all'],
      assignedSubjects: assignedSubjects,
      permissions: document.getElementById('inpAdminRole').value === 'Teacher' ? ['manage_grades', 'view_reports'] : ['all']
    };

    const action = isEdit ? 'updateAdmin' : 'addAdmin';
    const res = await API.request(action, payload);
    if (!res.success) {
      API.toastError(res.message || 'Operation failed.');
      return;
    }
    closeModal('modalAddAdmin');
    API.toastSuccess(isEdit ? 'Staff user updated.' : 'Staff user created.');
    loadAdminsTable();
  }

  function confirmDeleteAdmin(adminId, email) {
    if (confirm(`Revoke administrative access for ${email}?`)) {
      API.request('deleteAdmin', { adminId }).then(res => {
        if (res.success) {
          API.toastSuccess('User removed.');
          loadAdminsTable();
        } else {
          API.toastError(res.message);
        }
      });
    }
  }

  /* =======================================================================
     AUDIT LOGS & SETTINGS (NO BACKEND URL IN UI)
     ======================================================================= */
  async function loadAuditLogsTable() {
    const tbody = document.getElementById('auditTableBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted" style="padding:24px;">Loading audit events...</td></tr>';
    const res = await API.request('getAuditLogs', {}, 'GET');
    const logs = res.logs || [];
    if (!logs.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted" style="padding:24px;">No audit events recorded.</td></tr>';
      return;
    }
    tbody.innerHTML = logs.slice().reverse().map(l => `
      <tr>
        <td style="font-family:monospace; font-size:11.5px;">${formatTime(l.timestamp)}</td>
        <td><strong>${escapeHtml(l.actor)}</strong></td>
        <td><code style="background:#f1f5f9; padding:2px 6px; border-radius:4px; font-weight:700;">${escapeHtml(l.action)}</code></td>
        <td>${escapeHtml(l.target || '-')}</td>
        <td><span style="display:inline-block; padding:2px 8px; border-radius:12px; font-size:11px; font-weight:700; background:#dcfce7; color:#15803d;">${escapeHtml(l.outcome)}</span></td>
        <td>${escapeHtml(l.details || '')}</td>
      </tr>
    `).join('');
  }

  function loadSettingsView() {
    // School configurations display (Strictly NO backend URL in UI!)
    const conf = window.APP_CONFIG;
    const name = document.getElementById('setSchoolName');
    const location = document.getElementById('setCampusLocation');
    const phones = document.getElementById('setContactPhones');
    const email = document.getElementById('setContactEmail');
    const year = document.getElementById('setAcademicYear');

    if (name) name.value = conf.schoolName;
    if (location) location.value = conf.campusLocation;
    if (phones) phones.value = conf.contactPhones;
    if (email) email.value = conf.contactEmail;
    if (year) year.value = conf.academicYear;
  }

  /* =======================================================================
     MODAL CONTROLS & UTILITIES
     ======================================================================= */
  function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
  }

  function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  }

  function open2FAModal(customMsg) {
    const modal = document.getElementById('modal2FA');
    if (!modal) return;
    const mail = document.getElementById('display2FAEmail');
    if (mail) mail.textContent = state.pending2FA.email;
    const info = document.getElementById('note2FAInfo');
    if (info) info.textContent = customMsg || `Verification code sent to ${state.pending2FA.email}.`;

    for (let i = 1; i <= 6; i++) {
      const inp = document.getElementById('otp' + i);
      if (inp) inp.value = '';
    }
    modal.classList.remove('hidden');
    start2FACountdown();
    setTimeout(() => {
      const f = document.getElementById('otp1');
      if (f) f.focus();
    }, 150);
  }

  function start2FACountdown() {
    if (state.pending2FA.timer) clearInterval(state.pending2FA.timer);
    const cd = document.getElementById('resendCountdown');
    const btn = document.getElementById('btnResend2FA');
    if (btn) btn.disabled = true;

    state.pending2FA.timer = setInterval(() => {
      state.pending2FA.countdown--;
      if (cd) cd.textContent = `(${state.pending2FA.countdown}s)`;
      if (state.pending2FA.countdown <= 0) {
        clearInterval(state.pending2FA.timer);
        if (cd) cd.textContent = '';
        if (btn) btn.disabled = false;
      }
    }, 1000);
  }

  function setupOtpInputListeners() {
    for (let i = 1; i <= 6; i++) {
      const inp = document.getElementById('otp' + i);
      if (!inp) continue;
      inp.addEventListener('input', (e) => {
        const val = e.target.value.replace(/\D/g, '');
        e.target.value = val ? val[val.length - 1] : '';
        if (e.target.value && i < 6) {
          const next = document.getElementById('otp' + (i + 1));
          if (next) next.focus();
        }
      });
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !e.target.value && i > 1) {
          const prev = document.getElementById('otp' + (i - 1));
          if (prev) {
            prev.focus();
            prev.value = '';
          }
        }
      });
      inp.addEventListener('paste', (e) => {
        e.preventDefault();
        const p = (e.clipboardData || window.clipboardData).getData('text').trim().replace(/\D/g, '');
        for (let j = 0; j < 6 && j < p.length; j++) {
          const t = document.getElementById('otp' + (j + 1));
          if (t) t.value = p[j];
        }
        const f = document.getElementById('otp' + Math.min(6, p.length));
        if (f) f.focus();
      });
    }
  }

  function getOtpValue() {
    let code = '';
    for (let i = 1; i <= 6; i++) {
      const inp = document.getElementById('otp' + i);
      code += inp ? inp.value.trim() : '';
    }
    return code;
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatTime(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch (e) {
      return iso;
    }
  }

  function debounce(fn, delay) {
    let t;
    return function(...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  return {
    init,
    switchTab,
    openAddStudentModal,
    openEditStudentModal,
    confirmDeleteStudent,
    viewStudentReportCard,
    viewStudentPayments,
    saveSingleStudentGrade,
    openRecordPaymentModal,
    openAddAdminModal,
    openEditAdminModal,
    confirmDeleteAdmin,
    closeModal
  };
})();
