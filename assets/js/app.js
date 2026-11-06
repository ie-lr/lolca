/**
 * app.js
 * -----------------------------------------------------------------------
 * Light of Life Christian Academy (LOLCA) - Core Application Controller
 * Fully integrated with Central Database Server (Node.js API / Google Apps Script)
 * NO localStorage DB caching. Pure authoritative database communication.
 * Handles: Admins RBAC, Staff Management, Student Registry, Grade Marksheets,
 * Finance & Outflows, Monthly Staff Payroll, Curriculum, Class Fees,
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
    staffCache: [],
    expensesCache: [],
    payrollCache: [],
    selectedStudentForPayment: null,
    selectedStudentForReport: null,
    deferredPrompt: null
  };

  /* =======================================================================
     APPLICATION INITIALIZATION & ROUTING
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
      applyRbacPermissions();
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
     ROLE-BASED ACCESS CONTROL (RBAC) & COMPONENT PERMISSIONS
     ======================================================================= */
  function hasPermission(permissionName) {
    if (!state.currentUser) return false;
    const user = state.currentUser;
    // Super Admin or Primary email always has full access
    if (user.role === 'Super Admin' || (user.email && user.email.toLowerCase() === 'chrisnentorbor@gmail.com')) {
      return true;
    }
    const perms = Array.isArray(user.permissions) ? user.permissions : [];
    if (perms.includes('all')) return true;
    return perms.includes(permissionName);
  }

  function applyRbacPermissions() {
    const isSuper = state.currentUser && (state.currentUser.role === 'Super Admin' || (state.currentUser.email && state.currentUser.email.toLowerCase() === 'chrisnentorbor@gmail.com'));
    const isTeacher = state.currentUser && state.currentUser.role === 'Teacher';

    // Map each sidebar tab & action card to required permissions
    const tabPermMap = {
      dashboard: true, // always accessible
      admins: isSuper || hasPermission('all'),
      staff: hasPermission('manage_staff'),
      students: hasPermission('manage_students'),
      grades: hasPermission('manage_grades'),
      finance: hasPermission('manage_finance'),
      payroll: hasPermission('manage_payroll'),
      subjects: hasPermission('manage_curriculum'),
      feesSchedule: hasPermission('manage_finance'),
      payments: hasPermission('manage_finance') || hasPermission('manage_students'),
      reports: hasPermission('view_reports') || hasPermission('manage_grades') || hasPermission('manage_students'),
      settings: hasPermission('system_settings'),
      audit: hasPermission('system_settings')
    };

    // 1. Sidebar Nav Items
    document.querySelectorAll('.sidebar-nav-item[data-tab]').forEach(btn => {
      const tab = btn.getAttribute('data-tab');
      const canAccess = tabPermMap[tab] !== false;
      if (canAccess) {
        btn.classList.remove('hidden');
      } else {
        btn.classList.add('hidden');
      }
    });

    // 2. Dashboard Action Tiles
    document.querySelectorAll('.action-card-tile[data-target-tab]').forEach(tile => {
      const tab = tile.getAttribute('data-target-tab');
      const canAccess = tabPermMap[tab] !== false;
      if (canAccess) {
        tile.classList.remove('hidden');
      } else {
        tile.classList.add('hidden');
      }
    });

    // 3. User Role Title Badge
    const roleBadge = document.getElementById('sidebarUserRole');
    if (roleBadge) {
      roleBadge.textContent = state.currentUser ? (state.currentUser.role || 'Staff Admin') : 'Staff Admin';
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
     EVENT LISTENERS & FORM BINDINGS
     ======================================================================= */
  function setupEventHandlers() {
    // 1. Admin/Staff Login Form (NO STUDENT LOGIN HERE)
    const formAdmin = document.getElementById('formAdminLogin');
    if (formAdmin) {
      formAdmin.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('adminEmail').value.trim();
        const password = document.getElementById('adminPassword').value;
        const rememberMe = document.getElementById('adminRememberMe') ? document.getElementById('adminRememberMe').checked : false;

        const res = await API.request('adminLogin', { email, password });
        if (!res.success) {
          API.toast(res.message || 'Invalid credentials.', true);
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
          API.toast(`Welcome, ${res.user.fullName || res.user.email}!`);
          showAdminWorkstation();
        }
      });
    }

    // 2. Student Login Form (student.html ONLY)
    const formStudent = document.getElementById('formStudentLogin');
    if (formStudent) {
      formStudent.addEventListener('submit', async (e) => {
        e.preventDefault();
        const studentId = document.getElementById('studentIdInput').value.trim();
        const passwordInp = document.getElementById('studentPasswordInput');
        const password = passwordInp ? passwordInp.value : '';

        const res = await API.request('studentLogin', { studentId, password });
        if (!res.success) {
          API.toast(res.message || 'Invalid Student ID or password.', true);
          return;
        }

        API.setSessionToken(res.sessionToken, true);
        API.setCurrentUser(res.student, true);
        state.currentUser = res.student;
        state.userType = 'student';
        API.toast(`Welcome, ${res.student.fullName}!`);
        showStudentPortal();
      });
    }

    // 3. Student Password Toggle
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

    // 4. Student Portal Actions
    const btnStudentSettings = document.getElementById('btnStudentSettings');
    if (btnStudentSettings) btnStudentSettings.addEventListener('click', openStudentSettingsModal);

    const btnStudentShare = document.getElementById('btnStudentShareLink');
    if (btnStudentShare) btnStudentShare.addEventListener('click', openStudentShareModal);

    const btnStudentInstall = document.getElementById('btnStudentInstallApp');
    if (btnStudentInstall) btnStudentInstall.addEventListener('click', installWebApp);

    const btnStudentCopyUrl = document.getElementById('btnStudentCopyUrl');
    if (btnStudentCopyUrl) {
      btnStudentCopyUrl.addEventListener('click', () => {
        const urlInp = document.getElementById('inpStudentShareUrl');
        if (urlInp) {
          navigator.clipboard.writeText(urlInp.value).then(() => {
            API.toast('Student account link copied to clipboard!');
          });
        }
      });
    }

    const formStudentSettings = document.getElementById('formStudentSettings');
    if (formStudentSettings) formStudentSettings.addEventListener('submit', handleStudentSettingsSubmit);

    // 5. 2FA Form
    const form2FA = document.getElementById('form2FA');
    if (form2FA) {
      form2FA.addEventListener('submit', async (e) => {
        e.preventDefault();
        const code = document.getElementById('inp2FACode').value.trim();
        if (code.length < 6) {
          API.toast('Please enter 6-digit verification code.', true);
          return;
        }
        const res = await API.request('verify2FA', {
          email: state.pending2FA.email,
          tempToken: state.pending2FA.tempToken,
          code: code
        });
        if (!res.success) {
          API.toast(res.message || 'Invalid 2FA code.', true);
          return;
        }

        closeModal('modal2FA');
        API.setSessionToken(res.sessionToken, state.pending2FA.rememberMe);
        API.setCurrentUser(res.user, state.pending2FA.rememberMe);
        state.currentUser = res.user;
        state.userType = res.user.role === 'Teacher' ? 'teacher' : 'admin';
        API.toast(`2FA Verified. Welcome, ${res.user.fullName}!`);
        showAdminWorkstation();
      });
    }

    // 6. Logout
    document.querySelectorAll('.btn-logout').forEach(btn => {
      btn.addEventListener('click', handleLogout);
    });

    // 7. Sidebar Navigation Items
    document.querySelectorAll('.sidebar-nav-item').forEach(item => {
      item.addEventListener('click', () => {
        const tab = item.getAttribute('data-tab');
        if (tab) switchTab(tab);
      });
    });

    // 8. Dashboard Action Card Tiles
    document.querySelectorAll('.action-card-tile').forEach(tile => {
      tile.addEventListener('click', () => {
        const tab = tile.getAttribute('data-target-tab');
        if (tab) switchTab(tab);
      });
    });

    // 9. Go to Dashboard Top Navbar Button
    const btnGoDashboard = document.getElementById('btnGoDashboard');
    if (btnGoDashboard) btnGoDashboard.addEventListener('click', () => switchTab('dashboard'));

    // 10. Top Navbar Download & Share Buttons
    const btnTopDownload = document.getElementById('btnTopDownloadApp');
    if (btnTopDownload) btnTopDownload.addEventListener('click', installWebApp);

    const btnTopShare = document.getElementById('btnTopShareApp');
    if (btnTopShare) btnTopShare.addEventListener('click', () => openModal('modalShareApp'));

    const btnInstallAppAdmin = document.getElementById('btnInstallAppAdmin');
    if (btnInstallAppAdmin) btnInstallAppAdmin.addEventListener('click', installWebApp);

    // 11. Student Search & Multi-Parameter Filter
    const sSearch = document.getElementById('studentSearch');
    const sClassFilter = document.getElementById('studentClassFilter');
    const sGenderFilter = document.getElementById('studentGenderFilter');
    const sStatusFilter = document.getElementById('studentStatusFilter');

    if (sSearch) sSearch.addEventListener('input', debounce(loadStudentsTable, 250));
    if (sClassFilter) sClassFilter.addEventListener('change', loadStudentsTable);
    if (sGenderFilter) sGenderFilter.addEventListener('change', loadStudentsTable);
    if (sStatusFilter) sStatusFilter.addEventListener('change', loadStudentsTable);

    // 12. Add/Edit Student Form
    const formAddStudent = document.getElementById('formAddStudent');
    if (formAddStudent) formAddStudent.addEventListener('submit', handleAddStudentSubmit);

    // 13. Admins Management Form
    const formAddAdmin = document.getElementById('formAddAdmin');
    if (formAddAdmin) formAddAdmin.addEventListener('submit', handleAddAdminSubmit);

    // 14. Staff Management Form & Search/Filter
    const formAddStaff = document.getElementById('formAddStaff');
    if (formAddStaff) formAddStaff.addEventListener('submit', handleStaffFormSubmit);

    const staffSearch = document.getElementById('staffSearchInput');
    const staffStatus = document.getElementById('staffStatusFilter');
    if (staffSearch) staffSearch.addEventListener('input', debounce(loadStaffTable, 250));
    if (staffStatus) staffStatus.addEventListener('change', loadStaffTable);

    // 15. Finance & Expenses Form
    const formRecordExpense = document.getElementById('formRecordExpense');
    if (formRecordExpense) formRecordExpense.addEventListener('submit', handleRecordExpenseSubmit);

    // 16. Payroll Form, Filters & Calculations
    const formRecordPayroll = document.getElementById('formRecordPayroll');
    if (formRecordPayroll) formRecordPayroll.addEventListener('submit', handleRecordPayrollSubmit);

    const payrollYearSel = document.getElementById('payrollYearSelect');
    const payrollMonthSel = document.getElementById('payrollMonthSelect');
    if (payrollYearSel) payrollYearSel.addEventListener('change', loadPayrollView);
    if (payrollMonthSel) payrollMonthSel.addEventListener('change', loadPayrollView);

    const pStaffSel = document.getElementById('payrollSelectStaff');
    const pGrossInp = document.getElementById('payrollGross');
    const pDeductInp = document.getElementById('payrollDeductions');
    const pNetInp = document.getElementById('payrollNet');

    function updatePayrollNetCalculation() {
      if (pGrossInp && pDeductInp && pNetInp) {
        const gross = Number(pGrossInp.value) || 0;
        const ded = Number(pDeductInp.value) || 0;
        pNetInp.value = Math.max(0, gross - ded);
      }
    }

    if (pStaffSel) {
      pStaffSel.addEventListener('change', () => {
        const selectedOpt = pStaffSel.options[pStaffSel.selectedIndex];
        if (selectedOpt) {
          const salary = selectedOpt.getAttribute('data-salary') || '200';
          if (pGrossInp) pGrossInp.value = salary;
          if (pDeductInp) pDeductInp.value = 0;
          updatePayrollNetCalculation();
        }
      });
    }
    if (pGrossInp) pGrossInp.addEventListener('input', updatePayrollNetCalculation);
    if (pDeductInp) pDeductInp.addEventListener('input', updatePayrollNetCalculation);

    // 17. Grade Entry & Assessment Marksheet Selectors
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

    // 18. Fees & Payments Student Selector & Form
    const payStudentSelect = document.getElementById('paymentStudentSelect');
    if (payStudentSelect) {
      payStudentSelect.addEventListener('change', (e) => {
        loadStudentPaymentSheet(e.target.value);
      });
    }
    const formRecordPayment = document.getElementById('formRecordPayment');
    if (formRecordPayment) formRecordPayment.addEventListener('submit', handleRecordPaymentSubmit);

    // 19. Report Card Student Selector
    const reportStudentSelect = document.getElementById('reportStudentSelect');
    if (reportStudentSelect) {
      reportStudentSelect.addEventListener('change', (e) => {
        generateOfficialReportCard(e.target.value);
      });
    }

    // 20. Curriculum & Subjects Form
    const formAddSubject = document.getElementById('formAddSubject');
    if (formAddSubject) formAddSubject.addEventListener('submit', handleSaveSubjectSubmit);

    // 21. Class Fee & Requirements Form
    const formEditClassFee = document.getElementById('formEditClassFee');
    if (formEditClassFee) formEditClassFee.addEventListener('submit', handleSaveClassFeeSubmit);

    const feeTuition = document.getElementById('editFeeTuition');
    const feeOther = document.getElementById('editFeeOther');
    const feeTotal = document.getElementById('editFeeTotal');
    function updateEditFeeTotal() {
      if (feeTuition && feeOther && feeTotal) {
        feeTotal.value = (Number(feeTuition.value) || 0) + (Number(feeOther.value) || 0);
      }
    }
    if (feeTuition) feeTuition.addEventListener('input', updateEditFeeTotal);
    if (feeOther) feeOther.addEventListener('input', updateEditFeeTotal);

    // 22. Modal Close Buttons
    document.querySelectorAll('[data-close-modal]').forEach(btn => {
      btn.addEventListener('click', () => {
        const modalId = btn.getAttribute('data-close-modal');
        if (modalId) closeModal(modalId);
      });
    });
  }

  /* =======================================================================
     IMAGE & PHOTO UPLOAD HELPER (BASE64 DATAURL ENCODING)
     ======================================================================= */
  function setupImageUploadHandlers() {
    bindPhotoUpload('studentPhotoInput', 'imgStudentPhotoPreview', 'inpStudentPhotoUrl');
    bindPhotoUpload('inpStudentSelfPhotoFile', 'studentSelfPhotoPreview', 'inpStudentSelfPhotoUrl');
  }

  function bindPhotoUpload(fileInputId, imgPreviewId, hiddenInputId) {
    const fileInp = document.getElementById(fileInputId);
    const imgPrev = document.getElementById(imgPreviewId);
    const hiddenInp = document.getElementById(hiddenInputId);
    if (!fileInp) return;

    fileInp.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      if (file.size > 2 * 1024 * 1024) {
        API.toast('Image is larger than 2MB. Please choose a smaller photo.', true);
        return;
      }

      const reader = new FileReader();
      reader.onload = function (evt) {
        const dataUrl = evt.target.result;
        if (imgPrev) imgPrev.src = dataUrl;
        if (hiddenInp) hiddenInp.value = dataUrl;
      };
      reader.readAsDataURL(file);
    });
  }

  /* =======================================================================
     PWA WEB APP INSTALLATION CONTROLLER
     ======================================================================= */
  function setupPwaInstallListener() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      state.deferredPrompt = e;
      const bAdmin = document.getElementById('btnInstallAppAdmin');
      const bTop = document.getElementById('btnTopDownloadApp');
      const bStudent = document.getElementById('btnStudentInstallApp');
      if (bAdmin) bAdmin.style.display = 'inline-flex';
      if (bTop) bTop.style.display = 'inline-flex';
      if (bStudent) bStudent.style.display = 'inline-flex';
    });
  }

  async function installWebApp() {
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
      API.toast('LOLCA Web App is already installed and running in app mode!');
      return;
    }
    if (state.deferredPrompt) {
      state.deferredPrompt.prompt();
      const choice = await state.deferredPrompt.userChoice;
      if (choice && choice.outcome === 'accepted') {
        API.toast('LOLCA Web App installed successfully!');
      }
      state.deferredPrompt = null;
    } else {
      API.toast('To install LOLCA: Tap your browser menu (⋮ or ⋯) and select "Install App" or "Add to Home Screen".');
    }
  }

  /* =======================================================================
     ACCOUNT LINK SHARING (WHATSAPP, SMS, CLIPBOARD)
     ======================================================================= */
  function shareLink(portalType, method) {
    const origin = window.location.origin;
    let targetUrl = '';

    if (portalType === 'student') {
      const studentId = state.selectedStudentForReport || (state.currentUser && state.currentUser.studentId) || 'LOLCA-2025-001';
      targetUrl = `${origin}/student.html?id=${encodeURIComponent(studentId)}`;
    } else {
      targetUrl = `${origin}/index.html`;
    }

    const shareTitle = portalType === 'student' ? 'Light of Life Christian Academy Student Portal' : 'Light of Life Christian Academy Staff Workstation';
    const shareText = `Access ${shareTitle}: ${targetUrl}`;

    if (method === 'whatsapp') {
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`, '_blank');
    } else if (method === 'sms') {
      window.location.href = `sms:?body=${encodeURIComponent(shareText)}`;
    } else {
      navigator.clipboard.writeText(targetUrl).then(() => {
        API.toast('Portal link copied to clipboard!');
      }).catch(() => {
        prompt('Copy portal link:', targetUrl);
      });
    }
  }

  function openStudentShareModal() {
    const st = state.currentUser;
    if (!st) return;
    const origin = window.location.origin;
    const directUrl = `${origin}/student.html?id=${encodeURIComponent(st.studentId)}`;

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
      API.toast('New passwords do not match. Please re-enter.', true);
      return;
    }

    const res = await API.request('changeStudentPassword', {
      studentId: st.studentId,
      oldPassword: oldPassword,
      newPassword: newPassword,
      photoUrl: photoUrl
    });

    if (!res.success) {
      API.toast(res.message || 'Could not update password.', true);
      return;
    }

    state.currentUser = res.student;
    API.setCurrentUser(res.student, true);
    updateStudentHeader();
    closeModal('modalStudentSettings');
    API.toast('Password and profile photo updated successfully!');

    generateStudentOwnReportCard(res.student.studentId);
    loadStudentOwnPaymentSheet(res.student.studentId);
  }

  function handleLogout() {
    API.clearSession();
    state.currentUser = null;
    state.userType = null;
    API.toast('Signed out successfully.');
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
    const allTabIds = [
      'tabDashboard', 'tabAdmins', 'tabStaff', 'tabStudents', 'tabGrades',
      'tabFinance', 'tabPayroll', 'tabSubjects', 'tabFeesSchedule',
      'tabPayments', 'tabReports', 'tabSettings', 'tabAudit'
    ];
    allTabIds.forEach(id => {
      const pane = document.getElementById(id);
      if (pane) pane.classList.add('hidden');
    });

    const targetMap = {
      dashboard: 'tabDashboard',
      admins: 'tabAdmins',
      staff: 'tabStaff',
      students: 'tabStudents',
      grades: 'tabGrades',
      finance: 'tabFinance',
      payroll: 'tabPayroll',
      subjects: 'tabSubjects',
      feesSchedule: 'tabFeesSchedule',
      payments: 'tabPayments',
      reports: 'tabReports',
      settings: 'tabSettings',
      audit: 'tabAudit'
    };

    const targetId = targetMap[tabName] || 'tabDashboard';
    const targetPane = document.getElementById(targetId);
    if (targetPane) targetPane.classList.remove('hidden');

    const titleEl = document.getElementById('pageHeaderTitle');
    const titleMap = {
      dashboard: 'Primary Portal Dashboard',
      admins: 'Admins Management & Access Control',
      staff: 'Staff & Teachers Management',
      students: 'Student Information & Registry',
      grades: 'Grade Entry & Assessment Marksheets',
      finance: 'Finance & Expenditure Management',
      payroll: 'Monthly Staff Payroll Management',
      subjects: 'Curriculum & Subject Management',
      feesSchedule: 'Class Fees & Mandatory Requirements',
      payments: 'Fees & Official Payment Receipts (Half A4)',
      reports: 'Official 2-Page Terminal Report Cards',
      settings: 'School Configuration & App Downloads',
      audit: 'System Activity & Security Audit Logs'
    };
    if (titleEl) titleEl.textContent = titleMap[tabName] || 'LOLCA Portal';

    // Trigger tab loader
    switch (tabName) {
      case 'dashboard':
        loadDashboardStats();
        break;
      case 'admins':
        loadAdminsTable();
        break;
      case 'staff':
        loadStaffTable();
        break;
      case 'students':
        populateStudentClassFilter();
        loadStudentsTable();
        break;
      case 'grades':
        initGradesSelectors();
        break;
      case 'finance':
        loadFinanceView();
        break;
      case 'payroll':
        loadPayrollView();
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
      case 'settings':
        loadSettingsView();
        break;
      case 'audit':
        loadAuditLogsTable();
        break;
    }
  }

  function updateAdminProfileHeader() {
    const user = state.currentUser || {};
    const nameEl = document.getElementById('sidebarUserName');
    const roleEl = document.getElementById('sidebarUserRole');
    const avatarEl = document.getElementById('sidebarUserAvatar');

    if (nameEl) nameEl.textContent = user.fullName || user.email || 'Admin User';
    if (roleEl) roleEl.textContent = user.role || 'Staff Admin';
    if (avatarEl && user.photoUrl) avatarEl.src = user.photoUrl;
  }

  /* =======================================================================
     DASHBOARD TAB CONTROLLER (ACADEMIC & ENROLLMENT OVERVIEW)
     ======================================================================= */
  async function loadDashboardStats() {
    // 1. Fetch Student Count
    const resSt = await API.request('getStudents', {}, 'GET');
    if (resSt.success) {
      const stEl = document.getElementById('dashTotalStudents');
      if (stEl) stEl.textContent = resSt.total || (resSt.students ? resSt.students.length : 0);
    }

    // 2. Fetch Staff Count
    const resStaff = await API.request('getStaff', {}, 'GET');
    if (resStaff.success && resStaff.staff) {
      const staffEl = document.getElementById('dashTotalStaff');
      const activeStaff = resStaff.staff.filter(s => s.status === 'Active').length;
      if (staffEl) staffEl.textContent = activeStaff;
    }
  }

  /* =======================================================================
     ADMINS MANAGEMENT & RBAC TAB CONTROLLER
     ======================================================================= */
  async function loadAdminsTable() {
    const tbody = document.getElementById('adminsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted" style="padding:24px;">Loading administrator accounts...</td></tr>';

    const res = await API.request('getAdmins', {}, 'GET');
    if (!res.success) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding:24px; color:#ef4444;">${res.message || 'Access restricted.'}</td></tr>`;
      return;
    }

    state.adminsCache = res.admins || [];
    if (!state.adminsCache.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted" style="padding:24px;">No admin accounts found.</td></tr>';
      return;
    }

    tbody.innerHTML = state.adminsCache.map(a => {
      const isSuper = a.email.toLowerCase() === 'chrisnentorbor@gmail.com' || a.role === 'Super Admin';
      const perms = Array.isArray(a.permissions) ? a.permissions : [];
      const permBadges = perms.includes('all')
        ? '<span class="badge-status badge-active">Full System Access</span>'
        : perms.map(p => `<span class="badge-status badge-active" style="background:#e0f2fe; color:#0284c7; font-size:10.5px; margin:2px;">${escapeHtml(p.replace(/_/g, ' '))}</span>`).join(' ') || '<span class="text-muted" style="font-size:11px;">Basic View</span>';

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
          <td><strong style="color:#1e3a8a;">${escapeHtml(a.role)}</strong></td>
          <td style="max-width:280px;">${permBadges}</td>
          <td>
            <span class="badge-status ${a.requires2FA ? 'badge-active' : 'badge-resigned'}">
              ${a.requires2FA ? '2FA Protected' : 'Standard'}
            </span>
          </td>
          <td>
            <span class="badge-status ${a.status === 'Active' ? 'badge-active' : 'badge-suspended'}">
              ${escapeHtml(a.status || 'Active')}
            </span>
          </td>
          <td>
            ${isSuper ? '<span class="text-muted" style="font-size:11px; font-style:italic;">Primary Super Admin</span>' : `
              <div style="display:flex; gap:6px;">
                <button type="button" class="btn btn-secondary btn-sm" onclick="LOLCA_APP.openEditAdminModal('${a.adminId}')" title="Edit Admin & Permissions">
                  <img src="assets/icons/pencil.png" class="sys-icon" alt="Edit">
                </button>
                <button type="button" class="btn btn-danger btn-sm" onclick="LOLCA_APP.confirmDeleteAdmin('${a.adminId}', '${escapeHtml(a.fullName || a.email)}')" title="Revoke Admin Access">
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
    document.getElementById('editAdminOriginalId').value = '';
    document.getElementById('inpAdminEmail').readOnly = false;
    document.getElementById('inpAdminPassword').value = 'admin123';
    document.getElementById('inpAdmin2FA').checked = false;

    // Reset checkboxes
    document.querySelectorAll('input[name="adminPerms"]').forEach(chk => {
      chk.checked = false;
    });

    openModal('modalAddAdmin');
  }

  function openEditAdminModal(adminId) {
    const admin = state.adminsCache.find(a => a.adminId === adminId);
    if (!admin) return;

    document.getElementById('editAdminOriginalId').value = admin.adminId;
    document.getElementById('inpAdminFullName').value = admin.fullName;
    document.getElementById('inpAdminEmail').value = admin.email;
    document.getElementById('inpAdminEmail').readOnly = true;
    document.getElementById('inpAdminRole').value = admin.role;
    document.getElementById('inpAdminPhone').value = admin.phone || '';
    document.getElementById('inpAdminStatus').value = admin.status || 'Active';
    document.getElementById('inpAdmin2FA').checked = Boolean(admin.requires2FA);
    document.getElementById('inpAdminPassword').value = '';

    const perms = Array.isArray(admin.permissions) ? admin.permissions : [];
    document.querySelectorAll('input[name="adminPerms"]').forEach(chk => {
      chk.checked = perms.includes('all') || perms.includes(chk.value);
    });

    openModal('modalAddAdmin');
  }

  async function handleAddAdminSubmit(e) {
    e.preventDefault();
    const originalId = document.getElementById('editAdminOriginalId').value;
    const isEdit = Boolean(originalId);

    const checkedPerms = Array.from(document.querySelectorAll('input[name="adminPerms"]:checked')).map(el => el.value);

    const payload = {
      adminId: originalId || undefined,
      fullName: document.getElementById('inpAdminFullName').value.trim(),
      email: document.getElementById('inpAdminEmail').value.trim().toLowerCase(),
      role: document.getElementById('inpAdminRole').value,
      phone: document.getElementById('inpAdminPhone').value.trim(),
      status: document.getElementById('inpAdminStatus').value,
      requires2FA: document.getElementById('inpAdmin2FA').checked,
      permissions: checkedPerms.length ? checkedPerms : ['all']
    };

    const pass = document.getElementById('inpAdminPassword').value;
    if (pass) payload.password = pass;

    const action = isEdit ? 'updateAdmin' : 'addAdmin';
    const res = await API.request(action, payload);
    if (!res.success) {
      API.toast(res.message || 'Could not save administrator.', true);
      return;
    }

    closeModal('modalAddAdmin');
    API.toast(isEdit ? 'Administrator updated.' : 'Administrator registered.');
    loadAdminsTable();
  }

  function confirmDeleteAdmin(adminId, name) {
    if (confirm(`Are you sure you want to revoke administrative access for ${name}?`)) {
      API.request('deleteAdmin', { adminId }).then(res => {
        if (res.success) {
          API.toast('Administrator access revoked.');
          loadAdminsTable();
        } else {
          API.toast(res.message, true);
        }
      });
    }
  }

  /* =======================================================================
     STAFF MANAGEMENT TAB CONTROLLER (FIRE, SUSPEND, RESIGN)
     ======================================================================= */
  async function loadStaffTable() {
    const tbody = document.getElementById('staffTableBody');
    if (!tbody) return;

    const search = (document.getElementById('staffSearchInput')?.value || '').trim();
    const status = document.getElementById('staffStatusFilter')?.value || 'All';

    tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted" style="padding:24px;">Loading staff records from database...</td></tr>';

    const res = await API.request('getStaff', { search, status }, 'GET');
    if (!res.success) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted" style="padding:24px; color:#ef4444;">${res.message || 'Error loading staff.'}</td></tr>`;
      return;
    }

    state.staffCache = res.staff || [];
    const badge = document.getElementById('staffCountBadge');
    if (badge) badge.textContent = `${state.staffCache.length} staff recorded`;

    if (!state.staffCache.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted" style="padding:24px;">No staff records found.</td></tr>';
      return;
    }

    tbody.innerHTML = state.staffCache.map(s => {
      const statusClass = {
        'Active': 'badge-active',
        'Suspended': 'badge-suspended',
        'Resigned': 'badge-resigned',
        'Terminated': 'badge-terminated'
      }[s.status] || 'badge-active';

      return `
        <tr>
          <td>
            <div style="display:flex; align-items:center; gap:8px;">
              <img src="${s.photoUrl || 'assets/icons/circle-user-round.png'}" class="user-avatar-sm" alt="Photo" style="object-fit:cover;">
              <div>
                <strong>${escapeHtml(s.fullName)}</strong>
                <div style="font-size:11px; color:#64748b;">Joined: ${escapeHtml(s.hireDate || '2025-09-01')}</div>
              </div>
            </div>
          </td>
          <td><code style="font-weight:700; background:#f1f5f9; padding:2px 6px; border-radius:4px;">${escapeHtml(s.staffId)}</code></td>
          <td><strong>${escapeHtml(s.position)}</strong></td>
          <td><span style="font-size:12px; color:#475569;">${escapeHtml(s.department || 'Academic')}</span></td>
          <td><strong style="color:#15803d; font-size:13.5px;">$${Number(s.baseSalary || 0)}</strong></td>
          <td>
            <div style="font-size:12px;">${escapeHtml(s.phone || 'N/A')}</div>
            <div style="font-size:11px; color:#64748b;">${escapeHtml(s.email || '')}</div>
          </td>
          <td>
            <span class="badge-status ${statusClass}">${escapeHtml(s.status || 'Active')}</span>
          </td>
          <td>
            <div style="display:flex; align-items:center; gap:6px;">
              <!-- Quick Status Selector -->
              <select class="select-field" style="width:115px; padding:3px 6px; font-size:11.5px; font-weight:700;" onchange="LOLCA_APP.changeStaffStatus('${s.staffId}', this.value)">
                <option value="Active" ${s.status === 'Active' ? 'selected' : ''}>Active</option>
                <option value="Suspended" ${s.status === 'Suspended' ? 'selected' : ''}>Suspend</option>
                <option value="Resigned" ${s.status === 'Resigned' ? 'selected' : ''}>Resign</option>
                <option value="Terminated" ${s.status === 'Terminated' ? 'selected' : ''}>Fire / Terminate</option>
              </select>

              <button type="button" class="btn btn-secondary btn-sm" onclick="LOLCA_APP.openEditStaffModal('${s.staffId}')" title="Edit Staff Member">
                <img src="assets/icons/pencil.png" class="sys-icon" alt="Edit">
              </button>
              <button type="button" class="btn btn-danger btn-sm" onclick="LOLCA_APP.confirmDeleteStaff('${s.staffId}', '${escapeHtml(s.fullName)}')" title="Delete Record">
                <img src="assets/icons/delete.png" class="sys-icon" alt="Delete">
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  function openAddStaffModal() {
    const form = document.getElementById('formAddStaff');
    if (form) form.reset();
    document.getElementById('modalAddStaffTitle').textContent = 'Add New Staff Member';
    document.getElementById('editStaffOriginalId').value = '';
    document.getElementById('inpStaffId').readOnly = false;
    document.getElementById('inpStaffBaseSalary').value = '200';
    openModal('modalAddStaff');
  }

  function openEditStaffModal(staffId) {
    const staff = state.staffCache.find(s => s.staffId === staffId);
    if (!staff) return;

    document.getElementById('modalAddStaffTitle').textContent = `Edit Staff: ${staff.fullName}`;
    document.getElementById('editStaffOriginalId').value = staff.staffId;
    document.getElementById('inpStaffId').value = staff.staffId;
    document.getElementById('inpStaffId').readOnly = true;
    document.getElementById('inpStaffName').value = staff.fullName;
    document.getElementById('inpStaffPosition').value = staff.position;
    document.getElementById('inpStaffDept').value = staff.department || 'Academic / Elementary';
    document.getElementById('inpStaffBaseSalary').value = staff.baseSalary || 200;
    document.getElementById('inpStaffStatus').value = staff.status || 'Active';
    document.getElementById('inpStaffPhone').value = staff.phone || '';
    document.getElementById('inpStaffEmail').value = staff.email || '';

    openModal('modalAddStaff');
  }

  async function handleStaffFormSubmit(e) {
    e.preventDefault();
    const originalId = document.getElementById('editStaffOriginalId').value;
    const isEdit = Boolean(originalId);

    const payload = {
      staffId: originalId || (document.getElementById('inpStaffId').value.trim() || undefined),
      fullName: document.getElementById('inpStaffName').value.trim(),
      position: document.getElementById('inpStaffPosition').value.trim(),
      department: document.getElementById('inpStaffDept').value,
      baseSalary: Number(document.getElementById('inpStaffBaseSalary').value) || 0,
      status: document.getElementById('inpStaffStatus').value,
      phone: document.getElementById('inpStaffPhone').value.trim(),
      email: document.getElementById('inpStaffEmail').value.trim()
    };

    const action = isEdit ? 'updateStaff' : 'addStaff';
    const res = await API.request(action, payload);
    if (!res.success) {
      API.toast(res.message || 'Operation failed.', true);
      return;
    }

    closeModal('modalAddStaff');
    API.toast(isEdit ? 'Staff record updated.' : 'Staff member enrolled.');
    loadStaffTable();
    loadDashboardStats();
  }

  async function changeStaffStatus(staffId, newStatus) {
    const res = await API.request('updateStaffStatus', { staffId, status: newStatus });
    if (res.success) {
      API.toast(res.message || `Staff status updated to ${newStatus}.`);
      loadStaffTable();
      loadDashboardStats();
    } else {
      API.toast(res.message || 'Error updating status.', true);
    }
  }

  function confirmDeleteStaff(staffId, name) {
    if (confirm(`Are you sure you want to remove staff member '${name}' (${staffId})?`)) {
      API.request('deleteStaff', { staffId }).then(res => {
        if (res.success) {
          API.toast('Staff record deleted.');
          loadStaffTable();
          loadDashboardStats();
        } else {
          API.toast(res.message, true);
        }
      });
    }
  }

  /* =======================================================================
     STUDENT MANAGEMENT TAB CONTROLLER (WITH MULTI-PARAM FILTERS)
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
    const genderFilter = document.getElementById('studentGenderFilter')?.value || 'All';
    const statusFilter = document.getElementById('studentStatusFilter')?.value || 'All';

    tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted" style="padding:24px;">Loading student records from database...</td></tr>';

    const res = await API.request('getStudents', {
      search,
      class: classFilter,
      gender: genderFilter,
      status: statusFilter
    }, 'GET');

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
        <td>${escapeHtml(s.gender || 'Male')}</td>
        <td>
          <div style="font-size:12px;">${escapeHtml(s.guardianName || 'N/A')}</div>
          <div style="font-size:11px; color:#64748b;">${escapeHtml(s.guardianPhone || '')}</div>
        </td>
        <td><code style="font-size:11px; background:#f1f5f9; padding:2px 6px; border-radius:4px;">${escapeHtml(s.password || 'student123')}</code></td>
        <td>
          <span class="badge-status ${s.status === 'Active' ? 'badge-active' : 'badge-suspended'}">
            ${escapeHtml(s.status || 'Active')}
          </span>
        </td>
        <td>
          <div style="display:flex; gap:6px;">
            <button type="button" class="btn btn-secondary btn-sm" onclick="LOLCA_APP.viewStudentReportCard('${s.studentId}')" title="Official Report Card">
              <img src="assets/icons/file-text.png" class="sys-icon" alt="Report">
            </button>
            <button type="button" class="btn btn-secondary btn-sm" onclick="LOLCA_APP.viewStudentPayments('${s.studentId}')" title="Payments & Receipt">
              <img src="assets/icons/landmark.png" class="sys-icon" alt="Receipt">
            </button>
            <button type="button" class="btn btn-secondary btn-sm" onclick="LOLCA_APP.openEditStudentModal('${s.studentId}')" title="Edit Student">
              <img src="assets/icons/pencil.png" class="sys-icon" alt="Edit">
            </button>
            <button type="button" class="btn btn-danger btn-sm" onclick="LOLCA_APP.confirmDeleteStudent('${s.studentId}', '${escapeHtml(s.fullName)}')" title="Delete Student">
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
      API.toast(res.message || 'Operation failed.', true);
      return;
    }

    closeModal('modalAddStudent');
    API.toast(isEdit ? 'Student record updated.' : 'Student enrolled successfully.');
    loadStudentsTable();
    loadDashboardStats();
  }

  function confirmDeleteStudent(studentId, name) {
    if (confirm(`Are you sure you want to delete student '${name}' (${studentId})?`)) {
      API.request('deleteStudent', { studentId }).then(res => {
        if (res.success) {
          API.toast('Student deleted.');
          loadStudentsTable();
          loadDashboardStats();
        } else {
          API.toast(res.message, true);
        }
      });
    }
  }

  /* =======================================================================
     GRADE ENTRY & ASSESSMENT MARKSHEET (PER CLASS & PER SUBJECT)
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
      API.toast(`Grades saved for ${subject}!`);
    } else {
      API.toast(res.message || 'Could not save grade.', true);
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
      API.toast('No students to save.', true);
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
      API.toast(res.message || `Saved all grades for ${subject}!`);
    } else {
      API.toast(res.message || 'Error saving marksheet batch.', true);
    }
  }

  /* =======================================================================
     FINANCE MANAGEMENT TAB CONTROLLER (OUTFLOWS & AUTO-DEDUCTED BALANCE)
     ======================================================================= */
  async function loadFinanceView() {
    // 1. Fetch Summary
    const resSummary = await API.request('getFinanceSummary', {}, 'GET');
    if (resSummary.success && resSummary.summary) {
      const sm = resSummary.summary;
      const revEl = document.getElementById('finTotalRevenue');
      const expEl = document.getElementById('finTotalExpenses');
      const payEl = document.getElementById('finTotalPayroll');
      const balEl = document.getElementById('finNetBalance');

      if (revEl) revEl.textContent = `$${Number(sm.totalRevenue).toLocaleString()}`;
      if (expEl) expEl.textContent = `$${Number(sm.totalExpenses).toLocaleString()}`;
      if (payEl) payEl.textContent = `$${Number(sm.totalPayroll).toLocaleString()}`;
      if (balEl) {
        balEl.textContent = `$${Number(sm.netBalance).toLocaleString()}`;
        balEl.style.color = sm.netBalance >= 0 ? '#15803d' : '#ef4444';
      }
    }

    // 2. Fetch Expenses List
    const tbody = document.getElementById('expensesTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted" style="padding:24px;">Loading expenditure records...</td></tr>';
    const resExp = await API.request('getExpenses', {}, 'GET');
    if (!resExp.success) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted" style="padding:24px; color:#ef4444;">${resExp.message || 'Error loading expenses.'}</td></tr>`;
      return;
    }

    state.expensesCache = resExp.expenses || [];
    if (!state.expensesCache.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted" style="padding:24px;">No expenditures recorded yet.</td></tr>';
      return;
    }

    tbody.innerHTML = state.expensesCache.map(e => `
      <tr>
        <td>${escapeHtml(e.date)}</td>
        <td><code style="background:#f1f5f9; padding:2px 6px; border-radius:4px; font-weight:700;">${escapeHtml(e.receiptNumber || e.expenseId)}</code></td>
        <td><span style="font-size:12px; font-weight:700; color:#0284c7;">${escapeHtml(e.category)}</span></td>
        <td><strong>${escapeHtml(e.description)}</strong></td>
        <td>${escapeHtml(e.paidTo || 'N/A')}</td>
        <td><strong style="color:#b91c1c; font-size:14px;">$${Number(e.amount).toLocaleString()}</strong></td>
        <td><span class="text-muted" style="font-size:12px;">${escapeHtml(e.recordedBy || 'Admin')}</span></td>
        <td>
          <button type="button" class="btn btn-danger btn-sm" onclick="LOLCA_APP.confirmDeleteExpense('${e.expenseId}')" title="Delete Expense">
            <img src="assets/icons/delete.png" class="sys-icon" alt="Delete">
          </button>
        </td>
      </tr>
    `).join('');
  }

  function openRecordExpenseModal() {
    const form = document.getElementById('formRecordExpense');
    if (form) form.reset();
    document.getElementById('expDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('expReceiptNumber').value = 'VCH-' + Math.floor(100000 + Math.random() * 900000);
    openModal('modalRecordExpense');
  }

  async function handleRecordExpenseSubmit(e) {
    e.preventDefault();
    const payload = {
      amount: Number(document.getElementById('expAmount').value),
      category: document.getElementById('expCategory').value,
      description: document.getElementById('expDescription').value.trim(),
      paidTo: document.getElementById('expPaidTo').value.trim(),
      date: document.getElementById('expDate').value,
      receiptNumber: document.getElementById('expReceiptNumber').value.trim(),
      recordedBy: state.currentUser ? (state.currentUser.fullName || state.currentUser.email) : 'Admin'
    };

    const res = await API.request('addExpense', payload);
    if (!res.success) {
      API.toast(res.message || 'Error saving expense.', true);
      return;
    }

    closeModal('modalRecordExpense');
    API.toast(`Expense of $${payload.amount} committed to database!`);
    loadFinanceView();
    loadDashboardStats();
  }

  function confirmDeleteExpense(expenseId) {
    if (confirm(`Are you sure you want to delete expenditure record '${expenseId}'?`)) {
      API.request('deleteExpense', { expenseId }).then(res => {
        if (res.success) {
          API.toast('Expense record deleted.');
          loadFinanceView();
          loadDashboardStats();
        } else {
          API.toast(res.message, true);
        }
      });
    }
  }

  /* =======================================================================
     PAYROLL MANAGEMENT TAB CONTROLLER (MONTHLY SALARIES JAN - DEC)
     ======================================================================= */
  async function loadPayrollView() {
    const year = document.getElementById('payrollYearSelect')?.value || '2026';
    const month = document.getElementById('payrollMonthSelect')?.value || 'September';
    const tbody = document.getElementById('payrollTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted" style="padding:24px;">Loading payroll entries from database...</td></tr>';

    const res = await API.request('getPayroll', { year, month }, 'GET');
    if (!res.success) {
      tbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted" style="padding:24px; color:#ef4444;">${res.message || 'Error loading payroll.'}</td></tr>`;
      return;
    }

    state.payrollCache = res.payroll || [];
    const totalDisbursed = state.payrollCache.reduce((acc, p) => acc + (Number(p.netSalary) || 0), 0);
    const badge = document.getElementById('payrollSummaryBadge');
    if (badge) {
      badge.textContent = `Total Disbursed: $${totalDisbursed.toLocaleString()} (${state.payrollCache.length} staff)`;
    }

    if (!state.payrollCache.length) {
      tbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted" style="padding:24px;">No payroll disbursements recorded for ${month} ${year}.</td></tr>`;
      return;
    }

    tbody.innerHTML = state.payrollCache.map(p => `
      <tr>
        <td><code style="background:#f1f5f9; padding:2px 6px; border-radius:4px; font-weight:700;">${escapeHtml(p.payrollId)}</code></td>
        <td><strong>${escapeHtml(p.month)} ${escapeHtml(p.year)}</strong></td>
        <td>
          <strong>${escapeHtml(p.staffName)}</strong><br>
          <small class="text-muted">${escapeHtml(p.position || '')} • ${escapeHtml(p.staffId)}</small>
        </td>
        <td><strong style="color:#1e3a8a;">$${Number(p.grossSalary || 0)}</strong></td>
        <td><strong style="color:#b91c1c;">$${Number(p.deductions || 0)}</strong></td>
        <td><strong style="color:#15803d; font-size:14px;">$${Number(p.netSalary || 0)}</strong></td>
        <td>${escapeHtml(p.payDate)}</td>
        <td>
          <span class="badge-status ${p.receivedAndSigned ? 'badge-active' : 'badge-suspended'}">
            ${p.receivedAndSigned ? '✓ Received & Signed' : 'Pending Signature'}
          </span>
        </td>
        <td>
          <div style="display:flex; gap:6px;">
            <button type="button" class="btn btn-secondary btn-sm" onclick="LOLCA_APP.printPayrollVoucher('${p.payrollId}')" title="Print Payroll Voucher">
              <img src="assets/icons/download (2).png" class="sys-icon" alt="Print">
              Voucher
            </button>
            <button type="button" class="btn btn-danger btn-sm" onclick="LOLCA_APP.confirmDeletePayroll('${p.payrollId}')" title="Delete Payroll">
              <img src="assets/icons/delete.png" class="sys-icon" alt="Delete">
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  async function openRecordPayrollModal() {
    const form = document.getElementById('formRecordPayroll');
    if (form) form.reset();

    const curYear = document.getElementById('payrollYearSelect')?.value || '2026';
    const curMonth = document.getElementById('payrollMonthSelect')?.value || 'September';
    document.getElementById('payrollSelectYear').value = curYear;
    document.getElementById('payrollSelectMonth').value = curMonth === 'All' ? 'September' : curMonth;
    document.getElementById('payrollPayDate').value = new Date().toISOString().split('T')[0];

    const staffSel = document.getElementById('payrollSelectStaff');
    if (staffSel) {
      staffSel.innerHTML = '<option value="">Loading active staff...</option>';
      const res = await API.request('getStaff', {}, 'GET');
      const staffList = (res.staff || []).filter(s => s.status === 'Active');

      if (!staffList.length) {
        staffSel.innerHTML = '<option value="">No active staff found in Staff Management</option>';
        return;
      }

      staffSel.innerHTML = '<option value="">-- Select Staff Member --</option>' +
        staffList.map(s => `<option value="${s.staffId}" data-salary="${s.baseSalary}">${s.fullName} - ${s.position} ($${s.baseSalary})</option>`).join('');

      // Auto-populate first staff
      if (staffList.length > 0) {
        staffSel.value = staffList[0].staffId;
        document.getElementById('payrollGross').value = staffList[0].baseSalary;
        document.getElementById('payrollDeductions').value = 0;
        document.getElementById('payrollNet').value = staffList[0].baseSalary;
      }
    }

    openModal('modalRecordPayroll');
  }

  async function handleRecordPayrollSubmit(e) {
    e.preventDefault();
    const staffId = document.getElementById('payrollSelectStaff').value;
    if (!staffId) {
      API.toast('Please select a staff member.', true);
      return;
    }

    const payload = {
      year: document.getElementById('payrollSelectYear').value,
      month: document.getElementById('payrollSelectMonth').value,
      staffId: staffId,
      grossSalary: Number(document.getElementById('payrollGross').value) || 0,
      deductions: Number(document.getElementById('payrollDeductions').value) || 0,
      payDate: document.getElementById('payrollPayDate').value,
      disbursementMethod: document.getElementById('payrollMethod').value,
      receivedAndSigned: document.getElementById('payrollReceivedSigned').checked,
      comments: document.getElementById('payrollComments').value.trim(),
      recordedBy: state.currentUser ? (state.currentUser.fullName || state.currentUser.email) : 'Admin'
    };

    const res = await API.request('recordPayroll', payload);
    if (!res.success) {
      API.toast(res.message || 'Error processing payroll.', true);
      return;
    }

    closeModal('modalRecordPayroll');
    API.toast(`Salary of $${res.payroll.netSalary} disbursed to ${res.payroll.staffName}!`);
    loadPayrollView();
    loadFinanceView();
    loadDashboardStats();
  }

  function printPayrollVoucher(payrollId) {
    const item = state.payrollCache.find(p => p.payrollId === payrollId);
    if (!item) {
      API.toast('Payroll voucher details not found.', true);
      return;
    }

    const container = document.getElementById('payrollVoucherPrintTarget');
    if (!container) return;

    container.innerHTML = `
      <div class="payroll-voucher-slip">
        <!-- Voucher Header -->
        <div class="voucher-header">
          <img src="assets/images/LOLCA logo circle shape.png" alt="LOLCA Crest" class="voucher-logo">
          <div class="voucher-school-info">
            <h2>LIGHT OF LIFE CHRISTIAN ACADEMY (LOLCA)</h2>
            <div class="voucher-motto">"Assuring Full Life Through Sound Academic and Spiritual Education"</div>
            <div class="voucher-address">Light Community, Jlazon, Lower Margibi / Montserrado, Republic of Liberia</div>
          </div>
          <img src="assets/images/LOLCA logo circle shape.png" alt="LOLCA Crest" class="voucher-logo">
        </div>

        <div class="voucher-title-banner">
          OFFICIAL SALARY DISBURSEMENT VOUCHER &amp; PAY SLIP
        </div>

        <!-- Meta Grid -->
        <table class="receipt-student-meta-table" style="margin-bottom:14px;">
          <tr>
            <td style="width:50%;">
              STAFF NAME: <span style="font-weight:normal; margin-left:6px;"><strong>${escapeHtml(item.staffName)}</strong></span><br>
              STAFF ID: <code style="font-weight:700;">${escapeHtml(item.staffId)}</code>
            </td>
            <td style="width:50%;">
              PAYROLL PERIOD: <span style="font-weight:normal; margin-left:6px;"><strong>${escapeHtml(item.month)} ${escapeHtml(item.year)}</strong></span><br>
              DISBURSEMENT DATE: <span style="font-weight:normal; margin-left:6px;">${escapeHtml(item.payDate)}</span>
            </td>
          </tr>
          <tr>
            <td>POSITION / RESPONSIBILITY: <span style="font-weight:normal; margin-left:6px;">${escapeHtml(item.position || 'Staff')}</span></td>
            <td>PAYMENT METHOD: <span style="font-weight:normal; margin-left:6px;">${escapeHtml(item.disbursementMethod || 'Cash / Signed Voucher')}</span></td>
          </tr>
        </table>

        <!-- Salary Breakdown Table -->
        <table class="receipt-items-table" style="margin-bottom:16px;">
          <thead>
            <tr>
              <th>COMPENSATION ITEM</th>
              <th style="width:140px; text-align:right;">AMOUNT (USD)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Basic Gross Salary</td>
              <td style="text-align:right;"><strong>$${Number(item.grossSalary).toFixed(2)}</strong></td>
            </tr>
            <tr>
              <td>Statutory / Withholding Deductions</td>
              <td style="text-align:right; color:#b91c1c;">-$${Number(item.deductions).toFixed(2)}</td>
            </tr>
            <tr style="background:#f1f5f9;">
              <td><strong style="font-size:14px; color:#1e3a8a;">NET SALARY DISBURSED</strong></td>
              <td style="text-align:right;"><strong style="font-size:16px; color:#15803d;">$${Number(item.netSalary).toFixed(2)}</strong></td>
            </tr>
          </tbody>
        </table>

        ${item.comments ? `
          <div style="font-size:12px; margin-bottom:16px; color:#475569;">
            <strong>Memo / Notes:</strong> ${escapeHtml(item.comments)}
          </div>
        ` : ''}

        <!-- 3 Official Signatures -->
        <div class="receipt-signatures-container">
          <div class="receipt-signatures-grid">
            <div class="signature-col">
              <div class="sig-line"></div>
              <div class="sig-label">PREPARED BY (BURSAR / SECRETARY)</div>
              <div class="sig-date">Date: ${escapeHtml(item.payDate)}</div>
            </div>

            <div class="stamp-box-wrapper">
              <div class="stamp-box">
                <div class="stamp-title">LOLCA OFFICIAL</div>
                <div class="stamp-title">FINANCE SEAL</div>
                <div class="stamp-subtitle">PAID &amp; AUDITED</div>
              </div>
            </div>

            <div class="signature-col">
              <div class="sig-line"></div>
              <div class="sig-label">RECEIVED IN FULL (STAFF MEMBER)</div>
              <div class="sig-date">Status: ${item.receivedAndSigned ? '✓ Signed & Verified' : 'Pending Signature'}</div>
            </div>
          </div>
          <div class="receipt-footer-instructions">
            Official voucher filed in LOLCA School Administrative Archives. Keep a copy for personal tax records.
          </div>
        </div>
      </div>
    `;

    openModal('modalPrintPayrollVoucher');
  }

  function confirmDeletePayroll(payrollId) {
    if (confirm(`Are you sure you want to delete payroll record '${payrollId}'?`)) {
      API.request('deletePayroll', { payrollId }).then(res => {
        if (res.success) {
          API.toast('Payroll record deleted.');
          loadPayrollView();
          loadFinanceView();
          loadDashboardStats();
        } else {
          API.toast(res.message, true);
        }
      });
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
    document.getElementById('subjLevel').value = level;
    document.getElementById('modalAddSubjectTitle').textContent = `Add New ${level === 'preschool' ? 'Preschool' : 'Primary'} Subject`;
    openModal('modalAddSubject');
  }

  async function handleSaveSubjectSubmit(e) {
    e.preventDefault();
    const level = document.getElementById('subjLevel').value;
    const category = document.getElementById('subjCategory').value.trim();
    const subjectName = document.getElementById('subjName').value.trim();

    const res = await API.request('addSubject', { level, category, subjectName });
    if (!res.success) {
      API.toast(res.message || 'Could not add subject.', true);
      return;
    }

    closeModal('modalAddSubject');
    API.toast(res.message || 'Subject added successfully.');
    loadSubjectsView();
    updateGradesSubjectOptions();
  }

  async function deleteSubject(level, category, subjectName) {
    if (confirm(`Remove '${subjectName}' from ${category}?`)) {
      const res = await API.request('deleteSubject', { level, category, subjectName });
      if (res.success) {
        API.toast(res.message);
        loadSubjectsView();
        updateGradesSubjectOptions();
      } else {
        API.toast(res.message, true);
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
    document.getElementById('editFeeClassName').value = className;
    document.getElementById('editFeeTuition').value = info.tuition;
    document.getElementById('editFeeOther').value = info.other;
    document.getElementById('editFeeTotal').value = info.total;
    document.getElementById('editFeeRequirements').value = info.requirements || '';

    openModal('modalEditClassFee');
  }

  async function handleSaveClassFeeSubmit(e) {
    e.preventDefault();
    const className = document.getElementById('editFeeClassName').value;
    const tuition = Number(document.getElementById('editFeeTuition').value) || 0;
    const other = Number(document.getElementById('editFeeOther').value) || 0;
    const total = Number(document.getElementById('editFeeTotal').value) || (tuition + other);
    const requirements = document.getElementById('editFeeRequirements').value.trim();

    const res = await API.request('updateClassFee', {
      class: className,
      tuition,
      other,
      total,
      academicYear: '2025-2026',
      requirements
    });

    if (!res.success) {
      API.toast(res.message || 'Error updating fee.', true);
      return;
    }

    closeModal('modalEditClassFee');
    API.toast(res.message || `Fees & requirements updated for ${className}!`);
    loadFeesScheduleView();
  }

  /* =======================================================================
     FEES & PAYMENT TRACKING (HALF-A4 OFFICIAL RECEIPT)
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
    container.innerHTML = '<div class="text-center text-muted" style="padding:32px;">Loading payment history from database...</div>';

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
    if (mStudentId) mStudentId.value = st.studentId;
    if (mClass) mClass.value = `${st.class} (Total: $${fee.totalFees || 0})`;

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
                  STUDENT NAME: <span style="font-weight:normal; margin-left:6px;"><strong>${escapeHtml(st.fullName)}</strong></span><br>
                  <small class="text-muted">ID: <code style="font-weight:700;">${escapeHtml(st.studentId)}</code></small>
                </div>
              </div>
            </td>
            <td style="width:50%;">
              CLASS: <span style="font-weight:normal; margin-left:8px;"><strong>${escapeHtml(st.class)}</strong></span><br>
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
            <div class="summary-stat-val">$${sm.totalFeesAssessed || 0}</div>
            <div class="summary-stat-lbl">Class Total Fees</div>
          </div>
          <div>
            <div class="summary-stat-val" style="color:#15803d;">$${sm.grandTotalPaid || 0}</div>
            <div class="summary-stat-lbl">Total Amount Paid</div>
          </div>
          <div>
            <div class="summary-stat-val" style="color:${(sm.balanceDue || 0) > 0 ? '#b91c1c' : '#15803d'};">
              $${sm.balanceDue || 0}
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
    const pDate = document.getElementById('recordPayDate');
    const pRec = document.getElementById('recordPayReceiptNumber');
    const pComm = document.getElementById('recordPayComments');

    if (pAmount) pAmount.value = '';
    if (pDate) pDate.value = new Date().toISOString().split('T')[0];
    if (pRec) pRec.value = 'REC-' + Math.floor(100000 + Math.random() * 900000);
    if (pComm) pComm.value = '';

    openModal('modalRecordPayment');
  }

  async function handleRecordPaymentSubmit(e) {
    e.preventDefault();
    const studentId = document.getElementById('recordPayStudentId').value;
    const paymentType = document.getElementById('recordPayType').value;
    const amount = Number(document.getElementById('recordPayAmount').value);
    const receiptNum = document.getElementById('recordPayReceiptNumber').value.trim();
    const comments = document.getElementById('recordPayComments').value.trim();
    const date = document.getElementById('recordPayDate').value;

    const payload = {
      studentId: studentId,
      paymentType: paymentType,
      amount: amount,
      date: date,
      receiptNumber: receiptNum || undefined,
      comments: comments,
      recordedBy: state.currentUser ? (state.currentUser.fullName || state.currentUser.email) : 'Admin'
    };

    const res = await API.request('recordPayment', payload);
    if (!res.success) {
      API.toast(res.message || 'Payment recording failed.', true);
      return;
    }

    closeModal('modalRecordPayment');
    API.toast(`Payment of $${amount} recorded with Receipt #${receiptNum}!`);
    loadStudentPaymentSheet(studentId);
    loadFinanceView();
    loadDashboardStats();
  }

  /* =======================================================================
     OFFICIAL 2-PAGE REPORT CARDS (PRESCHOOL VS ELEMENTARY)
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
    container.innerHTML = '<div class="text-center text-muted" style="padding:32px;">Generating official report card from database...</div>';

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
     STUDENT PORTAL (student.html DATA CONTROLLER)
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

    generateStudentOwnReportCard(st.studentId);
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
     AUDIT LOGS & SETTINGS
     ======================================================================= */
  async function loadAuditLogsTable() {
    const tbody = document.getElementById('auditTableBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted" style="padding:24px;">Loading audit events from database...</td></tr>';
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
        <td><span class="badge-status badge-active">${escapeHtml(l.outcome)}</span></td>
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
    const msg = document.getElementById('msg2FA');
    if (msg) msg.textContent = customMsg || `Verification code required for Super Admin account.`;

    const inp = document.getElementById('inp2FACode');
    if (inp) inp.value = '';

    modal.classList.remove('hidden');
    start2FACountdown();
    setTimeout(() => {
      if (inp) inp.focus();
    }, 150);
  }

  function start2FACountdown() {
    if (state.pending2FA.timer) clearInterval(state.pending2FA.timer);
    const cd = document.getElementById('countdown2FA');

    state.pending2FA.timer = setInterval(() => {
      state.pending2FA.countdown--;
      if (cd) cd.textContent = `Code expires in ${state.pending2FA.countdown}s`;
      if (state.pending2FA.countdown <= 0) {
        clearInterval(state.pending2FA.timer);
        if (cd) cd.textContent = 'Code expired. Please request a new code.';
      }
    }, 1000);
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

  return {
    init,
    switchTab,
    openAddAdminModal,
    openEditAdminModal,
    confirmDeleteAdmin,
    openAddStaffModal,
    openEditStaffModal,
    changeStaffStatus,
    confirmDeleteStaff,
    openAddStudentModal,
    openEditStudentModal,
    confirmDeleteStudent,
    viewStudentReportCard,
    viewStudentPayments,
    saveSingleStudentGrade,
    saveAllClassMarksheet,
    openRecordExpenseModal,
    confirmDeleteExpense,
    openRecordPayrollModal,
    printPayrollVoucher,
    confirmDeletePayroll,
    openRecordPaymentModal,
    openAddSubjectModal,
    deleteSubject,
    openEditClassFeeModal,
    shareLink,
    installWebApp,
    openModal,
    closeModal
  };
})();
