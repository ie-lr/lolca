/**
 * app.js
 * -----------------------------------------------------------------------
 * Light of Life Christian Academy (LOLCA) - Core Application Controller
 * Handles Student Registry, Staff Management, Marksheets, Subjects, Class Fees,
 * Half-A4 Payment Receipts, and Official 2-Page Report Cards.
 * -----------------------------------------------------------------------
 */

const LOLCA_APP = (function () {
  const state = {
    currentUser: null,
    userType: null, // 'admin', 'teacher', 'student'
    activeTab: 'dashboard',
    pending2FA: { email: '', tempToken: '', rememberMe: false, countdown: 60, timer: null },
    studentsCache: [],
    adminsCache: [],
    selectedStudentForPayment: null,
    selectedStudentForReport: null,
    deferredPrompt: null
  };

  /* =======================================================================
     APPLICATION INITIALIZATION
     ======================================================================= */
  async function init() {
    setupPwaInstallListener();
    setupEventHandlers();
    setupImageUploadHandlers();

    const path = window.location.pathname.toLowerCase();

    if (path.includes('student.html')) {
      // Check query parameter for shared link: ?id=LOLCA-2025-001 or ?studentId=...
      const urlParams = new URLSearchParams(window.location.search);
      const sharedId = urlParams.get('id') || urlParams.get('studentId');
      const studentIdInp = document.getElementById('studentIdInput');
      if (sharedId && studentIdInp) {
        studentIdInp.value = sharedId.trim().toUpperCase();
      }

      const savedStudent = sessionStorage.getItem('lolca_user') || localStorage.getItem('lolca_user');
      const savedToken = API.getSessionToken();

      if (savedStudent && savedToken && savedToken.startsWith('token-student-')) {
        try {
          const st = JSON.parse(savedStudent);
          state.currentUser = st;
          state.userType = 'student';
          showStudentPortal();
          return;
        } catch (e) {}
      }
      showGateway();
    } else {
      // Admin / Staff Workstation
      const savedUser = sessionStorage.getItem('lolca_user') || localStorage.getItem('lolca_user');
      const savedToken = API.getSessionToken();

      if (savedUser && savedToken && !savedToken.startsWith('token-student-')) {
        try {
          const u = JSON.parse(savedUser);
          state.currentUser = u;
          state.userType = u.role === 'Teacher' ? 'teacher' : 'admin';
          showAdminWorkstation();
          return;
        } catch (e) {}
      }
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
    const preschoolClasses = window.APP_CONFIG.preschoolClasses || ["Nursery", "KI", "KII"];
    const isPreschool = preschoolClasses.map(c => c.toLowerCase()).includes((selectedClass || '').toLowerCase());
    const curriculum = isPreschool ? window.APP_CONFIG.preschoolCurriculum : window.APP_CONFIG.elementaryCurriculum;
    let allSubjects = [];
    Object.values(curriculum).forEach(list => { allSubjects = allSubjects.concat(list); });

    if (!state.currentUser || state.currentUser.role !== 'Teacher') return allSubjects;
    const assigned = state.currentUser.assignedSubjects || [];
    if (assigned.includes('all')) return allSubjects;
    return allSubjects.filter(s => assigned.includes(s));
  }

  /* =======================================================================
     EVENT LISTENERS & SETUP
     ======================================================================= */
  function setupEventHandlers() {
    // Admin/Teacher Login Form
    const formAdmin = document.getElementById('formAdminLogin');
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

    // Student Login Form with Password Protection
    const formStudent = document.getElementById('formStudentLogin');
    if (formStudent) {
      formStudent.addEventListener('submit', async (e) => {
        e.preventDefault();
        const studentId = document.getElementById('studentIdInput').value.trim();
        const passwordInp = document.getElementById('studentPasswordInput');
        const password = passwordInp ? passwordInp.value : '';

        const res = await API.request('studentLogin', { studentId, password });
        if (!res.success) {
          API.toastError(res.message || 'Invalid Student ID or password.');
          return;
        }

        API.setSessionToken(res.sessionToken, true);
        API.setCurrentUser(res.student, true);
        state.currentUser = res.student;
        state.userType = 'student';
        API.toastSuccess(`Welcome, ${res.student.fullName}!`);
        showStudentPortal();
      });
    }

    // Student Password Visibility Toggle
    const btnTogglePass = document.getElementById('btnToggleStudentPass');
    if (btnTogglePass) {
      btnTogglePass.addEventListener('click', () => {
        const inp = document.getElementById('studentPasswordInput');
        if (inp) {
          const isPass = inp.type === 'password';
          inp.type = isPass ? 'text' : 'password';
          btnTogglePass.textContent = isPass ? 'Hide' : 'Show';
        }
      });
    }

    // Student Portal Action Buttons
    const btnStudentSettings = document.getElementById('btnStudentSettings');
    if (btnStudentSettings) {
      btnStudentSettings.addEventListener('click', openStudentSettingsModal);
    }

    const btnStudentShare = document.getElementById('btnStudentShareLink');
    if (btnStudentShare) {
      btnStudentShare.addEventListener('click', openStudentShareModal);
    }

    const btnStudentInstall = document.getElementById('btnStudentInstallApp');
    if (btnStudentInstall) {
      btnStudentInstall.addEventListener('click', installWebApp);
    }

    const btnStudentCopyUrl = document.getElementById('btnStudentCopyUrl');
    if (btnStudentCopyUrl) {
      btnStudentCopyUrl.addEventListener('click', () => {
        const urlInp = document.getElementById('inpStudentShareUrl');
        if (urlInp) {
          navigator.clipboard.writeText(urlInp.value).then(() => {
            API.toastSuccess('Student account link copied to clipboard!');
          });
        }
      });
    }

    const formStudentSettings = document.getElementById('formStudentSettings');
    if (formStudentSettings) {
      formStudentSettings.addEventListener('submit', handleStudentSettingsSubmit);
    }

    // 2FA OTP Listeners
    setupOtpInputListeners();
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

    // Sidebar navigation
    document.querySelectorAll('.sidebar-nav-item').forEach(item => {
      item.addEventListener('click', () => {
        const tab = item.getAttribute('data-tab');
        if (tab) switchTab(tab);
      });
    });

    // Dashboard card tiles
    document.querySelectorAll('.action-card-tile').forEach(tile => {
      tile.addEventListener('click', () => {
        const tab = tile.getAttribute('data-target-tab');
        if (tab) switchTab(tab);
      });
    });

    // Go To Dashboard button
    const btnGoDashboard = document.getElementById('btnGoDashboard');
    if (btnGoDashboard) {
      btnGoDashboard.addEventListener('click', () => switchTab('dashboard'));
    }

    // Student Registry Search & Filter
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

    // Grade Entry Marksheet Class & Subject Selectors
    const gradesClass = document.getElementById('gradesSelectClass');
    const gradesSubject = document.getElementById('gradesSelectSubject');
    if (gradesClass) {
      gradesClass.addEventListener('change', () => {
        updateGradesSubjectOptions();
        loadClassMarksheet();
      });
    }
    if (gradesSubject) {
      gradesSubject.addEventListener('change', () => {
        loadClassMarksheet();
      });
    }
    const btnLoadMarksheet = document.getElementById('btnLoadMarksheet');
    if (btnLoadMarksheet) btnLoadMarksheet.addEventListener('click', loadClassMarksheet);

    const btnSaveAllMarksheet = document.getElementById('btnSaveAllMarksheet');
    if (btnSaveAllMarksheet) btnSaveAllMarksheet.addEventListener('click', saveAllClassMarksheet);

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

    // Subject Management Form
    const formAddSubject = document.getElementById('formAddSubject');
    if (formAddSubject) formAddSubject.addEventListener('submit', handleSaveSubjectSubmit);

    // Class Fee & Requirements Form
    const formEditClassFee = document.getElementById('formEditClassFee');
    if (formEditClassFee) formEditClassFee.addEventListener('submit', handleSaveClassFeeSubmit);

    // Tuition & Other fee live total calculation in modal
    const inpFeeTuition = document.getElementById('inpFeeTuition');
    const inpFeeOther = document.getElementById('inpFeeOther');
    const inpFeeTotal = document.getElementById('inpFeeTotal');
    function updateModalFeeTotal() {
      if (inpFeeTuition && inpFeeOther && inpFeeTotal) {
        const t = Number(inpFeeTuition.value) || 0;
        const o = Number(inpFeeOther.value) || 0;
        inpFeeTotal.value = t + o;
      }
    }
    if (inpFeeTuition) inpFeeTuition.addEventListener('input', updateModalFeeTotal);
    if (inpFeeOther) inpFeeOther.addEventListener('input', updateModalFeeTotal);

    // Admin PWA Download & Share buttons
    const btnInstallAppAdmin = document.getElementById('btnInstallAppAdmin');
    if (btnInstallAppAdmin) btnInstallAppAdmin.addEventListener('click', installWebApp);

    // Modal Close buttons
    document.querySelectorAll('[data-close-modal]').forEach(btn => {
      btn.addEventListener('click', () => {
        const modalId = btn.getAttribute('data-close-modal');
        if (modalId) closeModal(modalId);
      });
    });
  }

  /* =======================================================================
     IMAGE & PHOTO UPLOAD HELPER (BASE64 CONVERSION)
     ======================================================================= */
  function setupImageUploadHandlers() {
    // 1. Student Passport Photo in Add/Edit Student modal
    bindPhotoUpload('inpStudentPhotoFile', 'imgStudentPhotoPreview', 'inpStudentPhotoUrl');

    // 2. Admin Photo in Add/Edit Admin modal
    bindPhotoUpload('inpAdminPhotoFile', 'imgAdminPhotoPreview', 'inpAdminPhotoUrl');

    // 3. Student Self Photo in Student Settings modal
    bindPhotoUpload('inpStudentSelfPhotoFile', 'studentSelfPhotoPreview', 'inpStudentSelfPhotoUrl');

    // 4. Admin Self Photo in Settings tab
    const adminSelfInp = document.getElementById('inpAdminSelfPhotoFile');
    if (adminSelfInp) {
      adminSelfInp.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async function (evt) {
          const dataUrl = evt.target.result;
          const prev = document.getElementById('adminSelfPhotoPreview');
          const sidebarAvatar = document.getElementById('sidebarUserAvatar');
          if (prev) prev.src = dataUrl;
          if (sidebarAvatar) sidebarAvatar.src = dataUrl;

          if (state.currentUser) {
            state.currentUser.photoUrl = dataUrl;
            API.setCurrentUser(state.currentUser, true);
            await API.request('updateAdmin', { adminId: state.currentUser.adminId, photoUrl: dataUrl });
            API.toastSuccess('Profile photo updated successfully!');
          }
        };
        reader.readAsDataURL(file);
      });
    }
  }

  function bindPhotoUpload(fileInputId, imgPreviewId, hiddenInputId) {
    const fileInp = document.getElementById(fileInputId);
    const imgPrev = document.getElementById(imgPreviewId);
    const hiddenInp = document.getElementById(hiddenInputId);
    if (!fileInp || !imgPrev) return;

    fileInp.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) {
        API.toastError('Image file must be under 5MB.');
        return;
      }
      const reader = new FileReader();
      reader.onload = function (evt) {
        const dataUrl = evt.target.result;
        imgPrev.src = dataUrl;
        if (hiddenInp) hiddenInp.value = dataUrl;
      };
      reader.readAsDataURL(file);
    });
  }

  /* =======================================================================
     PWA WEB APP DOWNLOAD / INSTALL
     ======================================================================= */
  function setupPwaInstallListener() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      state.deferredPrompt = e;
    });
  }

  function installWebApp() {
    if (state.deferredPrompt) {
      state.deferredPrompt.prompt();
      state.deferredPrompt.userChoice.then((choice) => {
        if (choice.outcome === 'accepted') {
          API.toastSuccess('LOLCA App successfully installed!');
        }
        state.deferredPrompt = null;
      });
    } else {
      alert(
        "To install or download the LOLCA Web App:\n\n" +
        "• Google Chrome / Edge: Click the 'Install' icon (computer monitor with arrow) in the right side of the URL address bar.\n" +
        "• iPhone / Safari: Tap the 'Share' button at bottom, then choose 'Add to Home Screen'.\n" +
        "• Android / Chrome: Tap the top-right menu (3 dots) and select 'Install app' or 'Add to Home screen'."
      );
    }
  }

  /* =======================================================================
     ACCOUNT LINK SHARING (WHATSAPP, SMS, CLIPBOARD)
     ======================================================================= */
  function shareLink(portalType, method) {
    const baseUrl = window.location.origin + window.location.pathname;
    let targetUrl = baseUrl;

    if (portalType === 'student') {
      const studentId = state.selectedStudentForReport || (state.currentUser && state.currentUser.studentId) || 'LOLCA-2025-001';
      targetUrl = baseUrl.replace('admin.html', 'student.html') + `?id=${encodeURIComponent(studentId)}`;
    } else {
      targetUrl = baseUrl.replace('student.html', 'admin.html');
    }

    const shareTitle = portalType === 'student' ? 'LOLCA Student & Parent Portal' : 'LOLCA Staff & Teacher Workstation';
    const shareText = `Access ${shareTitle}: ${targetUrl}`;

    if (method === 'whatsapp') {
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`, '_blank');
    } else if (method === 'sms') {
      window.location.href = `sms:?body=${encodeURIComponent(shareText)}`;
    } else {
      navigator.clipboard.writeText(targetUrl).then(() => {
        API.toastSuccess('Portal link copied to clipboard!');
      }).catch(() => {
        prompt('Copy portal link:', targetUrl);
      });
    }
  }

  function openStudentShareModal() {
    const st = state.currentUser;
    if (!st) return;
    const baseUrl = window.location.origin + window.location.pathname;
    const directUrl = `${baseUrl}?id=${encodeURIComponent(st.studentId)}`;

    const urlInp = document.getElementById('inpStudentShareUrl');
    if (urlInp) urlInp.value = directUrl;

    const waBtn = document.getElementById('btnStudentWhatsApp');
    if (waBtn) {
      waBtn.href = `https://api.whatsapp.com/send?text=${encodeURIComponent(`Access my Light of Life Christian Academy Student Portal: ${directUrl}`)}`;
    }

    const smsBtn = document.getElementById('btnStudentSMS');
    if (smsBtn) {
      smsBtn.href = `sms:?body=${encodeURIComponent(`Access my Light of Life Christian Academy Student Portal: ${directUrl}`)}`;
    }

    openModal('modalStudentShare');
  }

  function openStudentSettingsModal() {
    const st = state.currentUser;
    if (!st) return;

    const nameEl = document.getElementById('displaySettingsStudentName');
    const idEl = document.getElementById('displaySettingsStudentId');
    const classEl = document.getElementById('displaySettingsStudentClass');
    const photoPrev = document.getElementById('studentSelfPhotoPreview');
    const photoHidden = document.getElementById('inpStudentSelfPhotoUrl');

    if (nameEl) nameEl.textContent = st.fullName;
    if (idEl) idEl.textContent = st.studentId;
    if (classEl) classEl.textContent = st.class;
    if (photoPrev) photoPrev.src = st.photoUrl || 'assets/icons/circle-user-round.png';
    if (photoHidden) photoHidden.value = st.photoUrl || '';

    const oldP = document.getElementById('inpStudentOldPass');
    const newP = document.getElementById('inpStudentNewPass');
    const confP = document.getElementById('inpStudentConfirmPass');
    if (oldP) oldP.value = '';
    if (newP) newP.value = '';
    if (confP) confP.value = '';

    openModal('modalStudentSettings');
  }

  async function handleStudentSettingsSubmit(e) {
    e.preventDefault();
    const st = state.currentUser;
    if (!st) return;

    const oldPassword = document.getElementById('inpStudentOldPass').value;
    const newPassword = document.getElementById('inpStudentNewPass').value;
    const confirmPassword = document.getElementById('inpStudentConfirmPass').value;
    const photoUrl = document.getElementById('inpStudentSelfPhotoUrl').value;

    if (newPassword !== confirmPassword) {
      API.toastError('New passwords do not match. Please re-enter.');
      return;
    }

    const res = await API.request('changeStudentPassword', {
      studentId: st.studentId,
      oldPassword: oldPassword,
      newPassword: newPassword,
      photoUrl: photoUrl
    });

    if (!res.success) {
      API.toastError(res.message || 'Could not update password.');
      return;
    }

    state.currentUser = res.student;
    API.setCurrentUser(res.student, true);
    updateStudentHeader();
    closeModal('modalStudentSettings');
    API.toastSuccess('Password and profile photo updated successfully!');

    // Re-render report card and receipt
    generateStudentOwnReportCard(res.student.studentId);
    loadStudentOwnPaymentSheet(res.student.studentId);
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
    ['tabDashboard', 'tabStudents', 'tabGrades', 'tabSubjects', 'tabFeesSchedule', 'tabPayments', 'tabReports', 'tabAdmins', 'tabAudit', 'tabSettings'].forEach(id => {
      const pane = document.getElementById(id);
      if (pane) pane.classList.add('hidden');
    });

    const targetMap = {
      dashboard: 'tabDashboard',
      students: 'tabStudents',
      grades: 'tabGrades',
      subjects: 'tabSubjects',
      feesSchedule: 'tabFeesSchedule',
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
      case 'subjects':
        loadSubjectsView();
        break;
      case 'feesSchedule':
        loadFeesScheduleView();
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
    const avatarEl = document.getElementById('sidebarUserAvatar');
    const selfPhotoEl = document.getElementById('adminSelfPhotoPreview');

    if (nameEl) nameEl.textContent = user.fullName || user.email || 'Admin User';
    if (roleEl) roleEl.textContent = user.role || 'Staff Admin';
    if (avatarEl && user.photoUrl) avatarEl.src = user.photoUrl;
    if (selfPhotoEl && user.photoUrl) selfPhotoEl.src = user.photoUrl;
  }

  /* =======================================================================
     DASHBOARD TAB
     ======================================================================= */
  async function loadDashboardStats() {
    const resA = await API.request('getAuditLogs', {}, 'GET');
    const logs = resA.logs || [];
    const listEl = document.getElementById('dashboardActivityList');
    if (listEl) {
      listEl.innerHTML = logs.slice().reverse().slice(0, 6).map(l => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid #f1f5f9; font-size:12.5px;">
          <div>
            <strong>${escapeHtml(l.actor)}</strong> &bull;
            <span style="color:#0284c7; font-weight:600;">${escapeHtml(l.action)}</span> &bull;
            <span class="text-muted">${escapeHtml(l.details || '')}</span>
          </div>
          <span class="text-muted" style="font-size:11px;">${formatTime(l.timestamp)}</span>
        </div>
      `).join('') || '<div class="text-muted" style="padding:10px 0;">No system logs recorded yet.</div>';
    }
  }

  /* =======================================================================
     STUDENT REGISTRY CONTROLLER
     ======================================================================= */
  function populateStudentClassFilter() {
    const sel = document.getElementById('studentClassFilter');
    const modalSel = document.getElementById('inpStudentClass');
    const classes = window.APP_CONFIG.classes || [];

    if (sel && sel.children.length <= 1) {
      sel.innerHTML = '<option value="All">All Grade Levels</option>' +
        classes.map(c => `<option value="${c}">${c}</option>`).join('');
    }
    if (modalSel && modalSel.children.length === 0) {
      modalSel.innerHTML = classes.map(c => `<option value="${c}">${c}</option>`).join('');
    }
  }

  async function loadStudentsTable() {
    const tbody = document.getElementById('studentsTableBody');
    if (!tbody) return;

    const search = (document.getElementById('studentSearch')?.value || '').trim();
    const classFilter = document.getElementById('studentClassFilter')?.value || 'All';

    tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted" style="padding:24px;">Loading student records...</td></tr>';

    const res = await API.request('getStudents', { search, class: classFilter }, 'GET');
    if (!res.success) {
      tbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted" style="padding:24px; color:#ef4444;">${res.message || 'Error loading students.'}</td></tr>`;
      return;
    }

    state.studentsCache = res.students || [];

    const badge = document.getElementById('studentCountBadge');
    if (badge) badge.textContent = `${state.studentsCache.length} enrolled`;

    if (!state.studentsCache.length) {
      tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted" style="padding:24px;">No student records found matching filters.</td></tr>';
      return;
    }

    tbody.innerHTML = state.studentsCache.map(s => `
      <tr>
        <td style="width:48px;">
          <img src="${s.photoUrl || 'assets/icons/circle-user-round.png'}" class="user-avatar-sm" alt="Photo" style="object-fit:cover;">
        </td>
        <td><strong>${escapeHtml(s.fullName)}</strong></td>
        <td><code style="background:#f1f5f9; padding:2px 6px; border-radius:4px; font-weight:700;">${escapeHtml(s.studentId)}</code></td>
        <td><span style="font-weight:700; color:#0284c7;">${escapeHtml(s.class)}</span></td>
        <td>${escapeHtml(s.guardianName || 'N/A')}</td>
        <td>${escapeHtml(s.guardianPhone || 'N/A')}</td>
        <td><code style="font-size:11px; background:#f1f5f9; padding:2px 6px; border-radius:4px;">${escapeHtml(s.password || 'student123')}</code></td>
        <td>
          <span style="display:inline-block; padding:2px 8px; border-radius:12px; font-size:11px; font-weight:700; background:${s.status === 'Active' ? '#dcfce7' : '#fee2e2'}; color:${s.status === 'Active' ? '#15803d' : '#b91c1c'};">
            ${escapeHtml(s.status || 'Active')}
          </span>
        </td>
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
    document.getElementById('inpStudentId').readOnly = false;
    document.getElementById('inpStudentPassword').value = 'student123';
    document.getElementById('inpStudentPhotoUrl').value = '';
    document.getElementById('imgStudentPhotoPreview').src = 'assets/icons/circle-user-round.png';
    populateStudentClassFilter();
    openModal('modalAddStudent');
  }

  function openEditStudentModal(studentId) {
    const student = state.studentsCache.find(s => s.studentId === studentId);
    if (!student) return;

    populateStudentClassFilter();
    document.getElementById('modalAddStudentTitle').textContent = `Edit Record: ${student.fullName}`;
    document.getElementById('editStudentOriginalId').value = student.studentId;
    document.getElementById('inpStudentId').value = student.studentId;
    document.getElementById('inpStudentId').readOnly = true;
    document.getElementById('inpStudentName').value = student.fullName;
    document.getElementById('inpStudentClass').value = student.class;
    document.getElementById('inpStudentGender').value = student.gender || 'Male';
    document.getElementById('inpStudentDob').value = student.dob || '';
    document.getElementById('inpGuardianName').value = student.guardianName || '';
    document.getElementById('inpGuardianPhone').value = student.guardianPhone || '';
    document.getElementById('inpGuardianEmail').value = student.guardianEmail || '';
    document.getElementById('inpStudentAddress').value = student.address || '';
    document.getElementById('inpStudentStatus').value = student.status || 'Active';
    document.getElementById('inpStudentPassword').value = student.password || 'student123';
    document.getElementById('inpStudentPhotoUrl').value = student.photoUrl || '';
    document.getElementById('imgStudentPhotoPreview').src = student.photoUrl || 'assets/icons/circle-user-round.png';

    openModal('modalAddStudent');
  }

  async function handleAddStudentSubmit(e) {
    e.preventDefault();
    const originalId = document.getElementById('editStudentOriginalId').value;
    const isEdit = Boolean(originalId);

    const payload = {
      studentId: isEdit ? originalId : (document.getElementById('inpStudentId').value.trim() || undefined),
      fullName: document.getElementById('inpStudentName').value.trim(),
      class: document.getElementById('inpStudentClass').value,
      gender: document.getElementById('inpStudentGender').value,
      dob: document.getElementById('inpStudentDob').value,
      guardianName: document.getElementById('inpGuardianName').value.trim(),
      guardianPhone: document.getElementById('inpGuardianPhone').value.trim(),
      guardianEmail: document.getElementById('inpGuardianEmail').value.trim(),
      address: document.getElementById('inpStudentAddress').value.trim(),
      status: document.getElementById('inpStudentStatus').value,
      password: document.getElementById('inpStudentPassword').value.trim() || 'student123',
      photoUrl: document.getElementById('inpStudentPhotoUrl').value.trim()
    };

    const action = isEdit ? 'updateStudent' : 'addStudent';
    const res = await API.request(action, payload);
    if (!res.success) {
      API.toastError(res.message || 'Operation failed.');
      return;
    }

    closeModal('modalAddStudent');
    API.toastSuccess(isEdit ? 'Student record updated.' : 'Student enrolled successfully.');
    loadStudentsTable();
  }

  function confirmDeleteStudent(studentId, name) {
    if (confirm(`Are you sure you want to delete student '${name}' (${studentId})?`)) {
      API.request('deleteStudent', { studentId }).then(res => {
        if (res.success) {
          API.toastSuccess('Student deleted.');
          loadStudentsTable();
        } else {
          API.toastError(res.message);
        }
      });
    }
  }

  /* =======================================================================
     GRADES ENTRY & ASSESSMENT MARKSHEET (PER CLASS & PER SUBJECT)
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
    if (subjects.length) {
      subjSel.value = subjects[0];
    }
  }

  async function loadClassMarksheet() {
    const classSel = document.getElementById('gradesSelectClass');
    const subjSel = document.getElementById('gradesSelectSubject');
    if (!classSel || !subjSel) return;

    const className = classSel.value;
    const subject = subjSel.value;
    const infoBanner = document.getElementById('marksheetHeaderInfo');
    const tbody = document.getElementById('marksheetTableBody');
    if (!tbody) return;

    if (!className || !subject) {
      tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted" style="padding:24px;">Please select both a class and a subject.</td></tr>';
      return;
    }

    tbody.innerHTML = `<tr><td colspan="10" class="text-center text-muted" style="padding:24px;">Loading marksheet for ${escapeHtml(subject)} (${escapeHtml(className)})...</td></tr>`;

    const res = await API.request('getClassMarksheet', { className, subject }, 'GET');
    if (!res.success) {
      tbody.innerHTML = `<tr><td colspan="10" class="text-center text-muted" style="padding:24px; color:#ef4444;">${res.message || 'Error loading marksheet.'}</td></tr>`;
      return;
    }

    const marksheet = res.marksheet || [];
    if (infoBanner) {
      infoBanner.innerHTML = `Currently Editing: <strong>${escapeHtml(subject)}</strong> &bull; Class: <strong>${escapeHtml(className)}</strong> (${marksheet.length} active students enrolled)`;
    }

    if (!marksheet.length) {
      tbody.innerHTML = `<tr><td colspan="10" class="text-center text-muted" style="padding:24px;">No active students enrolled in ${escapeHtml(className)}.</td></tr>`;
      return;
    }

    tbody.innerHTML = marksheet.map((s) => `
      <tr data-student-id="${s.studentId}">
        <td>
          <div style="display:flex; align-items:center; gap:8px;">
            <img src="${s.photoUrl || 'assets/icons/circle-user-round.png'}" class="user-avatar-sm" alt="Photo" style="object-fit:cover;">
            <div>
              <strong>${escapeHtml(s.fullName)}</strong><br>
              <small class="text-muted" style="font-family:monospace;">${s.studentId}</small>
            </div>
          </div>
        </td>
        <td><input type="number" min="0" max="100" class="input-field p-inp" data-field="p1" style="width:58px; text-align:center; padding:5px;" value="${s.p1 ?? ''}"></td>
        <td><input type="number" min="0" max="100" class="input-field p-inp" data-field="p2" style="width:58px; text-align:center; padding:5px;" value="${s.p2 ?? ''}"></td>
        <td><input type="number" min="0" max="100" class="input-field p-inp" data-field="p3" style="width:58px; text-align:center; padding:5px;" value="${s.p3 ?? ''}"></td>
        <td><input type="number" min="0" max="100" class="input-field p-inp" data-field="ex1" style="width:58px; text-align:center; padding:5px;" value="${s.ex1 ?? ''}"></td>
        <td><input type="number" min="0" max="100" class="input-field p-inp" data-field="p4" style="width:58px; text-align:center; padding:5px;" value="${s.p4 ?? ''}"></td>
        <td><input type="number" min="0" max="100" class="input-field p-inp" data-field="p5" style="width:58px; text-align:center; padding:5px;" value="${s.p5 ?? ''}"></td>
        <td><input type="number" min="0" max="100" class="input-field p-inp" data-field="p6" style="width:58px; text-align:center; padding:5px;" value="${s.p6 ?? ''}"></td>
        <td><input type="number" min="0" max="100" class="input-field p-inp" data-field="ex2" style="width:58px; text-align:center; padding:5px;" value="${s.ex2 ?? ''}"></td>
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
      recordedBy: state.currentUser ? (state.currentUser.fullName || state.currentUser.email) : 'Admin'
    };

    const res = await API.request('saveStudentSubjectGrade', payload);
    if (res.success) {
      tr.style.backgroundColor = '#ecfdf5';
      setTimeout(() => tr.style.backgroundColor = '', 1500);
      API.toastSuccess(`Grades saved for ${subject}!`);
    } else {
      API.toastError(res.message || 'Could not save grade.');
    }
  }

  async function saveAllClassMarksheet() {
    const subjSel = document.getElementById('gradesSelectSubject');
    const classSel = document.getElementById('gradesSelectClass');
    if (!subjSel || !classSel) return;

    const subject = subjSel.value;
    const className = classSel.value;
    const rows = document.querySelectorAll('#marksheetTableBody tr[data-student-id]');

    if (!rows.length) {
      API.toastError('No students to save.');
      return;
    }

    const records = [];
    rows.forEach(tr => {
      const studentId = tr.getAttribute('data-student-id');
      records.push({
        studentId: studentId,
        p1: tr.querySelector('[data-field="p1"]').value,
        p2: tr.querySelector('[data-field="p2"]').value,
        p3: tr.querySelector('[data-field="p3"]').value,
        ex1: tr.querySelector('[data-field="ex1"]').value,
        p4: tr.querySelector('[data-field="p4"]').value,
        p5: tr.querySelector('[data-field="p5"]').value,
        p6: tr.querySelector('[data-field="p6"]').value,
        ex2: tr.querySelector('[data-field="ex2"]').value
      });
    });

    const res = await API.request('saveClassMarksheetBatch', { className, subject, records });
    if (res.success) {
      rows.forEach(tr => {
        tr.style.backgroundColor = '#ecfdf5';
        setTimeout(() => tr.style.backgroundColor = '', 1500);
      });
      API.toastSuccess(res.message || `Saved all grades for ${subject}!`);
    } else {
      API.toastError(res.message || 'Error saving marksheet batch.');
    }
  }

  /* =======================================================================
     CURRICULUM & SUBJECTS TAB CONTROLLER
     ======================================================================= */
  async function loadSubjectsView() {
    const res = await API.request('getSubjects', {}, 'GET');
    if (!res.success) return;

    const preCont = document.getElementById('preschoolSubjectsContainer');
    const elemCont = document.getElementById('elementarySubjectsContainer');

    const preCurr = res.preschoolCurriculum || {};
    const elemCurr = res.elementaryCurriculum || {};

    if (preCont) {
      preCont.innerHTML = Object.entries(preCurr).map(([cat, list]) => `
        <div class="curriculum-card">
          <div class="curriculum-header">
            <strong style="color:#0284c7; font-size:13px;">${escapeHtml(cat)}</strong>
            <span style="font-size:11px; background:#e0f2fe; color:#0284c7; padding:2px 8px; border-radius:9999px; font-weight:700;">${list.length} subjects</span>
          </div>
          <div>
            ${list.map(s => `
              <span class="subject-badge-item">
                ${escapeHtml(s)}
                <button type="button" class="btn-remove-subj" onclick="LOLCA_APP.deleteSubject('preschool', '${escapeHtml(cat)}', '${escapeHtml(s)}')" title="Delete Subject">&times;</button>
              </span>
            `).join('')}
          </div>
        </div>
      `).join('') || '<div class="text-muted">No preschool subjects defined.</div>';
    }

    if (elemCont) {
      elemCont.innerHTML = Object.entries(elemCurr).map(([cat, list]) => `
        <div class="curriculum-card">
          <div class="curriculum-header">
            <strong style="color:#166534; font-size:13px;">${escapeHtml(cat)}</strong>
            <span style="font-size:11px; background:#dcfce7; color:#15803d; padding:2px 8px; border-radius:9999px; font-weight:700;">${list.length} subjects</span>
          </div>
          <div>
            ${list.map(s => `
              <span class="subject-badge-item">
                ${escapeHtml(s)}
                <button type="button" class="btn-remove-subj" onclick="LOLCA_APP.deleteSubject('elementary', '${escapeHtml(cat)}', '${escapeHtml(s)}')" title="Delete Subject">&times;</button>
              </span>
            `).join('')}
          </div>
        </div>
      `).join('') || '<div class="text-muted">No elementary subjects defined.</div>';
    }
  }

  function openAddSubjectModal(level = 'preschool') {
    const form = document.getElementById('formAddSubject');
    if (form) form.reset();
    document.getElementById('selSubjectLevel').value = level;
    document.getElementById('modalAddSubjectTitle').textContent = `Add New ${level === 'preschool' ? 'Preschool' : 'Primary'} Subject`;
    openModal('modalAddSubject');
  }

  async function handleSaveSubjectSubmit(e) {
    e.preventDefault();
    const level = document.getElementById('selSubjectLevel').value;
    const category = document.getElementById('inpSubjectCategory').value.trim();
    const subjectName = document.getElementById('inpSubjectName').value.trim();

    const res = await API.request('addSubject', { level, category, subjectName });
    if (!res.success) {
      API.toastError(res.message || 'Could not add subject.');
      return;
    }

    closeModal('modalAddSubject');
    API.toastSuccess(res.message || 'Subject added successfully.');
    loadSubjectsView();
    updateGradesSubjectOptions();
  }

  async function deleteSubject(level, category, subjectName) {
    if (confirm(`Remove '${subjectName}' from ${category}?`)) {
      const res = await API.request('deleteSubject', { level, category, subjectName });
      if (res.success) {
        API.toastSuccess(res.message);
        loadSubjectsView();
        updateGradesSubjectOptions();
      } else {
        API.toastError(res.message);
      }
    }
  }

  /* =======================================================================
     CLASS FEES & REQUIREMENTS CONTROLLER
     ======================================================================= */
  async function loadFeesScheduleView() {
    const tbody = document.getElementById('feesScheduleTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted" style="padding:24px;">Loading fee schedules...</td></tr>';

    const res = await API.request('getFeesSchedule', {}, 'GET');
    if (!res.success) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted" style="padding:24px; color:#ef4444;">${res.message || 'Error loading fees.'}</td></tr>`;
      return;
    }

    const fees = res.fees || {};
    const classes = window.APP_CONFIG.classes || Object.keys(fees);

    tbody.innerHTML = classes.map(c => {
      const info = fees[c] || { tuition: 0, other: 0, total: 0, academicYear: '2025-2026', requirements: 'Standard Supplies' };
      return `
        <tr>
          <td><strong style="color:#1e3a8a; font-size:13.5px;">${escapeHtml(c)}</strong></td>
          <td><strong style="color:#15803d;">$${info.tuition}</strong></td>
          <td><strong style="color:#0284c7;">$${info.other}</strong></td>
          <td><span style="font-weight:900; font-size:14px; color:#1e3a8a;">$${info.total}</span></td>
          <td>${escapeHtml(info.academicYear || '2025-2026')}</td>
          <td style="max-width:320px; font-size:12px; color:#475569;">
            ${escapeHtml(info.requirements || 'No specific supplies listed.')}
          </td>
          <td>
            <button type="button" class="btn btn-secondary btn-sm" onclick="LOLCA_APP.openEditClassFeeModal('${escapeHtml(c)}')">
              <img src="assets/icons/pencil.png" class="sys-icon" alt="Edit">
              Edit Fee & Requirements
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  async function openEditClassFeeModal(className) {
    const res = await API.request('getFeesSchedule', {}, 'GET');
    const fees = res.fees || {};
    const info = fees[className] || { tuition: 100, other: 30, total: 130, academicYear: '2025-2026', requirements: '' };

    document.getElementById('modalEditClassFeeTitle').textContent = `Edit Fees & Requirements: ${className}`;
    document.getElementById('inpFeeClassName').value = className;
    document.getElementById('inpFeeYear').value = info.academicYear || '2025-2026';
    document.getElementById('inpFeeTuition').value = info.tuition;
    document.getElementById('inpFeeOther').value = info.other;
    document.getElementById('inpFeeTotal').value = info.total;
    document.getElementById('inpFeeRequirements').value = info.requirements || '';

    openModal('modalEditClassFee');
  }

  async function handleSaveClassFeeSubmit(e) {
    e.preventDefault();
    const className = document.getElementById('inpFeeClassName').value;
    const tuition = Number(document.getElementById('inpFeeTuition').value) || 0;
    const other = Number(document.getElementById('inpFeeOther').value) || 0;
    const total = Number(document.getElementById('inpFeeTotal').value) || (tuition + other);
    const academicYear = document.getElementById('inpFeeYear').value.trim();
    const requirements = document.getElementById('inpFeeRequirements').value.trim();

    const res = await API.request('updateClassFee', {
      class: className,
      tuition,
      other,
      total,
      academicYear,
      requirements
    });

    if (!res.success) {
      API.toastError(res.message || 'Error updating fee.');
      return;
    }

    closeModal('modalEditClassFee');
    API.toastSuccess(res.message || `Fees & requirements updated for ${className}!`);
    loadFeesScheduleView();
  }

  /* =======================================================================
     FEES & PAYMENT TRACKING (EXACT HALF-A4 RECEIPT MATCHING IMAGE 6)
     ======================================================================= */
  async function initPaymentsSection() {
    const sel = document.getElementById('paymentStudentSelect');
    if (!sel) return;

    const res = await API.request('getStudents', { search: '', class: 'All' }, 'GET');
    const students = res.students || [];

    sel.innerHTML = '<option value="">-- Choose Student to View Payments & Issue Receipt --</option>' +
      students.map(s => `<option value="${s.studentId}">${s.fullName} (${s.class} - ${s.studentId})</option>`).join('');

    if (state.selectedStudentForPayment) {
      sel.value = state.selectedStudentForPayment;
      loadStudentPaymentSheet(state.selectedStudentForPayment);
    } else if (students.length) {
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
    const fee = res.feeStructure || {};
    const sm = res.summary || {};
    const tPay = res.tuitionPayments || [];
    const oPay = res.otherPayments || [];

    // Pre-fill record payment modal
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
            <div class="receipt-motto">"Assuring Full Life Through Sound Academic and Spiritual Education"</div>
            <div class="receipt-location-info">
              Wakor Junction, Light Community, Jlazon, Lower Margibi / Montserrado County, Republic of Liberia<br>
              Tel: 0778240169 / 0886383455 / 0777908308 &bull; WhatsApp: 0776277517 &bull; Email: bavidngombu15@gmail.com
            </div>
          </div>
          <img src="assets/images/LOLCA logo circle shape.png" alt="LOLCA Crest" class="receipt-logo-crest">
        </div>

        <div class="receipt-yellow-divider"></div>

        <!-- Title Box -->
        <div class="receipt-section-box-title">
          OFFICIAL STUDENT PAYMENT RECEIPT &amp; FINANCIAL STATEMENT
        </div>

        <!-- Student Meta Table (with photo thumbnail) -->
        <table class="receipt-student-meta-table">
          <tr>
            <td style="width:50%;">
              <div style="display:flex; align-items:center; gap:8px;">
                ${st.photoUrl ? `<img src="${st.photoUrl}" class="user-avatar-sm" alt="Student Photo">` : ''}
                <div>
                  STUDENT NAME: <span style="font-weight:normal; margin-left:6px;">${escapeHtml(st.fullName)}</span><br>
                  <small class="text-muted">ID: <code style="font-weight:700;">${escapeHtml(st.studentId)}</code></small>
                </div>
              </div>
            </td>
            <td style="width:50%;">
              CLASS: <span style="font-weight:normal; margin-left:8px;">${escapeHtml(st.class)}</span><br>
              SCHOOL YEAR: <span style="font-weight:normal; margin-left:8px;">${escapeHtml(fee.academicYear || '2025-2026')}</span>
            </td>
          </tr>
          <tr>
            <td>PARENT / GUARDIAN: <span style="font-weight:normal; margin-left:8px;">${escapeHtml(st.guardianName || 'N/A')}</span></td>
            <td>PHONE: <span style="font-weight:normal; margin-left:8px;">${escapeHtml(st.guardianPhone || 'N/A')}</span></td>
          </tr>
        </table>

        <!-- Class Requirements Summary Box (Dynamically tied to assigned class) -->
        ${fee.requirements ? `
          <div class="receipt-requirements-box">
            <strong>Mandatory Class Supplies &amp; Requirements for ${escapeHtml(st.class)}:</strong><br>
            ${escapeHtml(fee.requirements)}
          </div>
        ` : ''}

        <!-- Box 1: Tuition Fees -->
        <div class="receipt-section-box-title">
          PARENT INFORMATION (TUITION FEES)
        </div>

        <table class="receipt-items-table">
          <thead>
            <tr>
              <th style="width:95px;">DATE</th>
              <th>PAYMENT DESCRIPTION</th>
              <th style="width:110px;">RECEIPT #</th>
              <th style="width:85px;">AMOUNT</th>
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
              <tr><td colspan="5" class="text-center text-muted" style="padding:6px;">No tuition payments entered yet.</td></tr>
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
              <th style="width:95px;">DATE</th>
              <th>PAYMENT DESCRIPTION</th>
              <th style="width:110px;">RECEIPT #</th>
              <th style="width:85px;">AMOUNT</th>
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
              <tr><td colspan="5" class="text-center text-muted" style="padding:6px;">No other fee payments recorded.</td></tr>
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

        <!-- Secretary Signature & Official Stamp Section (Half-A4 Format) -->
        <div class="receipt-signatures-container">
          <div class="receipt-signatures-grid">
            <!-- Left: Secretary / Bursar -->
            <div class="signature-col">
              <div class="sig-line"></div>
              <div class="sig-label">SECRETARY / BURSAR SIGNATURE</div>
              <div class="sig-date">Date: ${new Date().toLocaleDateString()}</div>
            </div>

            <!-- Center: School Stamp Box -->
            <div class="stamp-box-wrapper">
              <div class="stamp-box">
                <div class="stamp-title">OFFICIAL SCHOOL</div>
                <div class="stamp-title">STAMP / SEAL</div>
                <div class="stamp-subtitle">LOLCA BURSAR OFFICE</div>
              </div>
            </div>

            <!-- Right: Parent / Payer -->
            <div class="signature-col">
              <div class="sig-line"></div>
              <div class="sig-label">PARENT / PAYER SIGNATURE</div>
              <div class="sig-date">Date: ____________________</div>
            </div>
          </div>
          <div class="receipt-footer-instructions">
            Secretary of the school to print, sign, and stamp before issuing to student or parent. Valid only with official school seal.
          </div>
        </div>

        <!-- Actions in UI -->
        <div class="no-print" style="margin-top:16px; display:flex; justify-content:flex-end; gap:10px;">
          <button type="button" class="btn btn-secondary" onclick="window.print()">
            <img src="assets/icons/download (2).png" class="sys-icon" alt="Print">
            Print Official Receipt (Half A4)
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
    const pAmount = document.getElementById('recordPayAmount');
    const pDesc = document.getElementById('recordPayDesc');
    const pRec = document.getElementById('recordPayReceiptNum');
    const pComm = document.getElementById('recordPayComments');

    if (pAmount) pAmount.value = '';
    if (pDesc) pDesc.value = '';
    if (pRec) pRec.value = '';
    if (pComm) pComm.value = '';

    openModal('modalRecordPayment');
  }

  async function handleRecordPaymentSubmit(e) {
    e.preventDefault();
    const studentId = document.getElementById('recordPayStudentId').value;
    const paymentType = document.getElementById('recordPayType').value;
    const amount = document.getElementById('recordPayAmount').value;
    const paymentDescription = document.getElementById('recordPayDesc').value.trim();
    const receiptNum = document.getElementById('recordPayReceiptNum').value.trim();
    const comments = document.getElementById('recordPayComments').value.trim();

    const payload = {
      studentId: studentId,
      paymentType: paymentType,
      amount: amount,
      paymentDescription: paymentDescription || undefined,
      receiptNumber: receiptNum || undefined,
      comments: comments,
      recordedBy: state.currentUser ? (state.currentUser.fullName || state.currentUser.email) : 'Admin'
    };

    const res = await API.request('recordPayment', payload);
    if (!res.success) {
      API.toastError(res.message || 'Payment recording failed.');
      return;
    }

    closeModal('modalRecordPayment');
    API.toastSuccess(`Payment of $${amount} recorded with Receipt #${res.summary ? receiptNum || 'Generated' : ''}!`);
    loadStudentPaymentSheet(studentId);
  }

  /* =======================================================================
     OFFICIAL 2-PAGE REPORT CARDS (PRESCHOOL VS ELEMENTARY STRICT SEPARATION)
     ======================================================================= */
  async function initReportsSection() {
    const sel = document.getElementById('reportStudentSelect');
    if (!sel) return;

    const res = await API.request('getStudents', { search: '', class: 'All' }, 'GET');
    const students = res.students || [];

    sel.innerHTML = '<option value="">-- Choose Student to View Official Report Card --</option>' +
      students.map(s => `<option value="${s.studentId}">${s.fullName} (${s.class} - ${s.studentId})</option>`).join('');

    if (state.selectedStudentForReport) {
      sel.value = state.selectedStudentForReport;
      generateOfficialReportCard(state.selectedStudentForReport);
    } else if (students.length) {
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
        <div class="no-print" style="width:100%; max-width:950px; display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <h3 style="font-size:16px; font-weight:800; color:#1e293b; margin:0;">
            Official 2-Page Report Card - ${escapeHtml(st.fullName)} (${escapeHtml(st.class)})
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
              <div class="cover-header-row" style="align-items:flex-start;">
                <img src="assets/images/LOLCA logo circle shape.png" alt="LOLCA Crest" class="cover-shield-crest">
                <div class="cover-header-text">
                  <h3>LIGHT OF LIFE CHRISTIAN ACADEMY (LOLCA)</h3>
                  <div class="cover-contact-text">
                    Light Community, Jlazon, Lower Margibi<br>
                    Republic of Liberia<br>
                    Tel: 0778240169 / 0886383455 / 0777908308<br>
                    Email: bavidngombu15@gmail.com &bull; WhatsApp: 0776277517
                  </div>
                </div>
                ${st.photoUrl ? `
                  <div class="report-cover-photo-frame" title="Student Passport Photo">
                    <img src="${st.photoUrl}" alt="Photo">
                  </div>
                ` : `
                  <div class="report-cover-photo-frame" style="display:flex; flex-direction:column; align-items:center; justify-content:center; font-size:10px; color:#94a3b8;">
                    <img src="assets/icons/circle-user-round.png" style="width:36px; height:36px; opacity:0.4;" alt="Avatar">
                    Photo
                  </div>
                `}
              </div>

              <div class="report-main-badge-title">
                ${isPre ? 'PRE-GRADE REPORT CARD' : 'ELEMENTARY REPORT CARD'}
              </div>

              <div style="font-size:13px; line-height:1.9; margin-bottom:12px;">
                Student's Name <span class="blank-fill-line" style="min-width:230px;">${escapeHtml(st.fullName)}</span><br>
                Grade: <span class="blank-fill-line" style="min-width:90px;">${escapeHtml(st.class)}</span>&nbsp;&nbsp;&nbsp;&nbsp;School Year: <span class="blank-fill-line" style="min-width:90px;">${escapeHtml(st.academicYear || '2025-2026')}</span>
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
                      <td>${r.p1 !== '' ? r.p1 : '—'}</td>
                      <td>${r.p2 !== '' ? r.p2 : '—'}</td>
                      <td>${r.p3 !== '' ? r.p3 : '—'}</td>
                      <td>${r.ex1 !== '' ? r.ex1 : '—'}</td>
                      <td><strong>${r.sem1Ave !== '' ? r.sem1Ave : '—'}</strong></td>
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
                      <td>${r.p4 !== '' ? r.p4 : '—'}</td>
                      <td>${r.p5 !== '' ? r.p5 : '—'}</td>
                      <td>${r.p6 !== '' ? r.p6 : '—'}</td>
                      <td>${r.ex2 !== '' ? r.ex2 : '—'}</td>
                      <td><strong>${r.sem2Ave !== '' ? r.sem2Ave : '—'}</strong></td>
                      <td><strong style="color:#0284c7;">${r.yrAve !== '' ? r.yrAve : '—'}</strong></td>
                    </tr>
                  `).join('')}
                `).join('')}
              </tbody>
            </table>
          </div>

          <!-- Bottom: Conduct & Grading Key -->
          ${isPre ? `
            <div style="font-size:11px; margin-top:14px; text-align:center; font-style:italic; background:#f8fafc; padding:8px; border-radius:4px; border:1px solid #e2e8f0;">
              <strong>Method of Grading (Pre-Grade Scale):</strong><br>
              A+ = Excellent (95-100); A- = Very good (85-94); B+ = Good (80-84); B- = Fair (75-79); C = Needs Improvement (70-74); D = Poor (60-69)
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
    const avatarEl = document.getElementById('studentPortalAvatar');
    if (nameEl) nameEl.textContent = st.fullName;
    if (classEl) classEl.textContent = `${st.class} • ID: ${st.studentId}`;
    if (avatarEl && st.photoUrl) avatarEl.src = st.photoUrl;
  }

  async function loadStudentPortalData() {
    const st = state.currentUser;
    if (!st) return;

    // Load student's own report card
    generateStudentOwnReportCard(st.studentId);
    // Load student's own payment receipt
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
            <div style="display:flex; align-items:center; gap:8px;">
              <img src="${a.photoUrl || 'assets/icons/circle-user-round.png'}" class="user-avatar-sm" alt="Photo" style="object-fit:cover;">
              <div>
                <strong>${escapeHtml(a.fullName || a.email)}</strong>
                <div style="font-size:11px; color:#64748b;">${escapeHtml(a.email)}</div>
              </div>
            </div>
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
    document.getElementById('inpAdminPhotoUrl').value = '';
    document.getElementById('imgAdminPhotoPreview').src = 'assets/icons/circle-user-round.png';

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
    document.getElementById('inpAdminPhotoUrl').value = admin.photoUrl || '';
    document.getElementById('imgAdminPhotoPreview').src = admin.photoUrl || 'assets/icons/circle-user-round.png';

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
      photoUrl: document.getElementById('inpAdminPhotoUrl').value.trim(),
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
     AUDIT LOGS & SETTINGS
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

    const prev = document.getElementById('adminSelfPhotoPreview');
    if (prev && state.currentUser && state.currentUser.photoUrl) {
      prev.src = state.currentUser.photoUrl;
    }
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
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  // Self initialize on DOM load
  document.addEventListener('DOMContentLoaded', init);

  return {
    init,
    switchTab,
    openAddStudentModal,
    openEditStudentModal,
    confirmDeleteStudent,
    viewStudentReportCard,
    viewStudentPayments,
    saveSingleStudentGrade,
    saveAllClassMarksheet,
    openRecordPaymentModal,
    openAddAdminModal,
    openEditAdminModal,
    confirmDeleteAdmin,
    openAddSubjectModal,
    deleteSubject,
    openEditClassFeeModal,
    shareLink,
    installWebApp,
    closeModal
  };
})();
