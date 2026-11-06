/**
 * api.js
 * -----------------------------------------------------------------------
 * Fetch client & offline data manager for LOLCA School Management System.
 * Connects to Google Apps Script Web App when configured in config.js,
 * or transparently runs in a complete, persistent local mock simulator.
 * -----------------------------------------------------------------------
 */

const API = (function() {
  let activeRequests = 0;
  const LOCAL_STORAGE_DB_KEY = 'lolca_school_v3_db';

  function getBackendUrl() {
    return String((window.APP_CONFIG && window.APP_CONFIG.backendUrl) || '').trim();
  }

  function showLoader(msg = 'Communicating with School System...') {
    activeRequests++;
    const loader = document.getElementById('globalLoader');
    if (loader) {
      const txt = loader.querySelector('.loader-text');
      if (txt) txt.textContent = msg;
      loader.classList.remove('hidden');
    }
  }

  function hideLoader() {
    activeRequests = Math.max(0, activeRequests - 1);
    if (activeRequests === 0) {
      const loader = document.getElementById('globalLoader');
      if (loader) loader.classList.add('hidden');
    }
  }

  function toast(message, isError = false) {
    let toastEl = document.getElementById('globalToast');
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.id = 'globalToast';
      toastEl.className = 'global-toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = message;
    toastEl.style.backgroundColor = isError ? 'var(--color-danger, #ef4444)' : 'var(--color-primary, #1e3a8a)';
    toastEl.classList.remove('hidden', 'fade-out');
    clearTimeout(toastEl._timer);
    toastEl._timer = setTimeout(() => {
      toastEl.classList.add('fade-out');
      setTimeout(() => toastEl.classList.add('hidden'), 300);
    }, 3200);
  }

  function getSessionToken() {
    return sessionStorage.getItem('lolca_session_token') || localStorage.getItem('lolca_session_token') || '';
  }

  function setSessionToken(token, persist = false) {
    if (persist) {
      localStorage.setItem('lolca_session_token', token);
    } else {
      sessionStorage.setItem('lolca_session_token', token);
    }
  }

  function getCurrentUser() {
    const raw = sessionStorage.getItem('lolca_user') || localStorage.getItem('lolca_user');
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  function setCurrentUser(user, persist = false) {
    const serialized = JSON.stringify(user);
    if (persist) {
      localStorage.setItem('lolca_user', serialized);
    } else {
      sessionStorage.setItem('lolca_user', serialized);
    }
  }

  function clearSession() {
    sessionStorage.removeItem('lolca_session_token');
    sessionStorage.removeItem('lolca_user');
    localStorage.removeItem('lolca_session_token');
    localStorage.removeItem('lolca_user');
  }

  /**
   * Unified dispatch function
   */
  async function request(action, payload = {}, method = 'POST') {
    const backendUrl = getBackendUrl();

    // If backend URL is empty or unconfigured, use full built-in mock simulator
    if (!backendUrl) {
      return executeMockAction_(action, payload);
    }

    showLoader();
    try {
      const token = getSessionToken();
      let response;

      if (method.toUpperCase() === 'GET') {
        const queryParams = new URLSearchParams(Object.assign({ action: action, sessionToken: token }, payload));
        const url = `${backendUrl}?${queryParams.toString()}`;
        response = await fetch(url, { method: 'GET' });
      } else {
        const bodyData = Object.assign({ action: action, sessionToken: token }, payload);
        response = await fetch(backendUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(bodyData)
        });
      }

      const json = await response.json();
      hideLoader();
      return json;
    } catch (err) {
      hideLoader();
      console.warn('Backend request failed. Utilizing persistent local engine.', err);
      return executeMockAction_(action, payload);
    }
  }

  /**
   * Local in-browser persistent database engine.
   */
  function getLocalDb_() {
    const raw = localStorage.getItem(LOCAL_STORAGE_DB_KEY);
    if (raw) {
      try { return JSON.parse(raw); } catch (e) {}
    }

    const defaultCurriculumPreschool = JSON.parse(JSON.stringify(window.APP_CONFIG.preschoolCurriculum || {}));
    const defaultCurriculumElementary = JSON.parse(JSON.stringify(window.APP_CONFIG.elementaryCurriculum || {}));
    const defaultClassFees = JSON.parse(JSON.stringify(window.APP_CONFIG.classFees || {}));

    const seed = {
      admins: [
        {
          adminId: 'ADM-001',
          email: 'chrisnentorbor@gmail.com',
          fullName: 'Chris Nentorbor',
          role: 'Super Admin',
          permissions: ['all'],
          assignedClasses: ['all'],
          assignedSubjects: ['all'],
          status: 'Active',
          requires2FA: true,
          phone: '+231-778240169',
          password: 'admin',
          photoUrl: 'assets/images/LOLCA logo circle shape.png',
          createdAt: new Date().toISOString()
        },
        {
          adminId: 'ADM-002',
          email: 'teacher@lolca.edu.lr',
          fullName: 'Mrs. Rebecca Flomo',
          role: 'Teacher',
          permissions: ['manage_grades', 'view_reports'],
          assignedClasses: ['4th Grade', '5th Grade'],
          assignedSubjects: ['Grammar', 'Arithmetic', 'General Science'],
          status: 'Active',
          requires2FA: false,
          phone: '+231-886000111',
          password: 'teacher123',
          photoUrl: '',
          createdAt: new Date().toISOString()
        }
      ],
      students: [
        {
          studentId: 'LOLCA-2025-001',
          fullName: 'Ezekiel Doe',
          gender: 'Male',
          class: '4th Grade',
          dob: '2015-04-12',
          guardianName: 'Jeremiah Doe',
          guardianPhone: '+231-778111222',
          guardianEmail: 'jdoe@example.com',
          address: 'Light Community, Jlazon',
          enrollmentDate: '2025-09-01',
          academicYear: '2025-2026',
          status: 'Active',
          password: 'student123',
          photoUrl: 'assets/images/WhatsApp Image 2026-07-10 at 10.52.31 AM.jpeg'
        },
        {
          studentId: 'LOLCA-2025-002',
          fullName: 'Grace Weah',
          gender: 'Female',
          class: '4th Grade',
          dob: '2015-08-20',
          guardianName: 'Martha Weah',
          guardianPhone: '+231-886333444',
          guardianEmail: 'mweah@example.com',
          address: 'Wakor Junction',
          enrollmentDate: '2025-09-01',
          academicYear: '2025-2026',
          status: 'Active',
          password: 'student123',
          photoUrl: 'assets/images/69d55492-c17d-4096-b2ee-fa2834050082.jfif'
        },
        {
          studentId: 'LOLCA-2025-003',
          fullName: 'Samuel K. Johnson',
          gender: 'Male',
          class: 'KI',
          dob: '2020-03-15',
          guardianName: 'Peter Johnson',
          guardianPhone: '+231-775555666',
          guardianEmail: 'pjohnson@example.com',
          address: 'Jlazon, Margibi',
          enrollmentDate: '2025-09-01',
          academicYear: '2025-2026',
          status: 'Active',
          password: 'student123',
          photoUrl: 'assets/images/4238c817-2e37-4eea-9a6d-7181f86554f3.jfif'
        }
      ],
      // Fee structures with requirements per class
      classFees: defaultClassFees,
      // Curricula
      preschoolCurriculum: defaultCurriculumPreschool,
      elementaryCurriculum: defaultCurriculumElementary,
      // 6-period + exams grades structure
      grades: [
        // Ezekiel Doe (Grade 4 - Elementary)
        { studentId: 'LOLCA-2025-001', subject: 'Grammar', p1: 90, p2: 88, p3: 92, ex1: 94, p4: 91, p5: 89, p6: 95, ex2: 92 },
        { studentId: 'LOLCA-2025-001', subject: 'Reading Comprehension', p1: 85, p2: 86, p3: 88, ex1: 90, p4: 87, p5: 88, p6: 89, ex2: 91 },
        { studentId: 'LOLCA-2025-001', subject: 'Composition', p1: 88, p2: 90, p3: 91, ex1: 92, p4: 90, p5: 92, p6: 94, ex2: 93 },
        { studentId: 'LOLCA-2025-001', subject: 'Spelling', p1: 95, p2: 98, p3: 96, ex1: 99, p4: 96, p5: 97, p6: 100, ex2: 98 },
        { studentId: 'LOLCA-2025-001', subject: 'Vocabulary', p1: 89, p2: 91, p3: 90, ex1: 93, p4: 92, p5: 94, p6: 95, ex2: 94 },
        { studentId: 'LOLCA-2025-001', subject: 'Arithmetic', p1: 92, p2: 94, p3: 96, ex1: 98, p4: 95, p5: 97, p6: 99, ex2: 98 },
        { studentId: 'LOLCA-2025-001', subject: 'Geometry', p1: 86, p2: 88, p3: 90, ex1: 91, p4: 89, p5: 90, p6: 92, ex2: 93 },
        { studentId: 'LOLCA-2025-001', subject: 'Pre-Algebra', p1: 84, p2: 86, p3: 88, ex1: 89, p4: 87, p5: 89, p6: 90, ex2: 91 },
        { studentId: 'LOLCA-2025-001', subject: 'Physical and Health Education', p1: 94, p2: 96, p3: 95, ex1: 97, p4: 96, p5: 98, p6: 99, ex2: 98 },
        { studentId: 'LOLCA-2025-001', subject: 'Information Technology', p1: 90, p2: 92, p3: 94, ex1: 96, p4: 93, p5: 95, p6: 96, ex2: 97 },
        { studentId: 'LOLCA-2025-001', subject: 'Agriculture', p1: 88, p2: 89, p3: 91, ex1: 93, p4: 90, p5: 92, p6: 94, ex2: 94 },
        { studentId: 'LOLCA-2025-001', subject: 'History', p1: 87, p2: 89, p3: 90, ex1: 92, p4: 91, p5: 93, p6: 94, ex2: 95 },
        { studentId: 'LOLCA-2025-001', subject: 'Home Economics', p1: 90, p2: 91, p3: 93, ex1: 94, p4: 92, p5: 94, p6: 95, ex2: 96 },
        { studentId: 'LOLCA-2025-001', subject: 'Social and Environment Studies', p1: 89, p2: 90, p3: 92, ex1: 93, p4: 91, p5: 93, p6: 95, ex2: 94 },
        { studentId: 'LOLCA-2025-001', subject: 'Civics', p1: 91, p2: 93, p3: 94, ex1: 96, p4: 94, p5: 96, p6: 97, ex2: 98 },
        { studentId: 'LOLCA-2025-001', subject: 'CHRISTIAN RELIGIOUS EDUCATION', p1: 98, p2: 99, p3: 100, ex1: 100, p4: 99, p5: 100, p6: 100, ex2: 100 },

        // Samuel K. Johnson (KI - Preschool)
        { studentId: 'LOLCA-2025-003', subject: 'Reading', p1: 92, p2: 94, p3: 95, ex1: 96, p4: 94, p5: 96, p6: 98, ex2: 97 },
        { studentId: 'LOLCA-2025-003', subject: 'Recognizing Letters', p1: 95, p2: 96, p3: 98, ex1: 99, p4: 97, p5: 98, p6: 100, ex2: 99 },
        { studentId: 'LOLCA-2025-003', subject: 'Writing Letters', p1: 88, p2: 90, p3: 92, ex1: 94, p4: 91, p5: 93, p6: 95, ex2: 94 },
        { studentId: 'LOLCA-2025-003', subject: 'Spelling', p1: 90, p2: 92, p3: 94, ex1: 95, p4: 93, p5: 95, p6: 97, ex2: 96 },
        { studentId: 'LOLCA-2025-003', subject: 'Speech-Work', p1: 94, p2: 95, p3: 97, ex1: 98, p4: 96, p5: 98, p6: 99, ex2: 99 },
        { studentId: 'LOLCA-2025-003', subject: 'Handwriting', p1: 89, p2: 91, p3: 93, ex1: 94, p4: 92, p5: 94, p6: 96, ex2: 95 },
        { studentId: 'LOLCA-2025-003', subject: 'Reading Numbers', p1: 96, p2: 98, p3: 99, ex1: 100, p4: 98, p5: 99, p6: 100, ex2: 100 },
        { studentId: 'LOLCA-2025-003', subject: 'Recognizing Numbers', p1: 95, p2: 97, p3: 98, ex1: 99, p4: 97, p5: 99, p6: 100, ex2: 100 },
        { studentId: 'LOLCA-2025-003', subject: 'Writing Numbers', p1: 90, p2: 92, p3: 94, ex1: 95, p4: 93, p5: 95, p6: 97, ex2: 96 },
        { studentId: 'LOLCA-2025-003', subject: 'Spelling Numbers', p1: 88, p2: 90, p3: 92, ex1: 93, p4: 91, p5: 93, p6: 95, ex2: 94 },
        { studentId: 'LOLCA-2025-003', subject: 'Natural Science', p1: 92, p2: 94, p3: 95, ex1: 97, p4: 95, p5: 97, p6: 98, ex2: 98 },
        { studentId: 'LOLCA-2025-003', subject: 'Physical and Health Science', p1: 94, p2: 95, p3: 97, ex1: 98, p4: 96, p5: 98, p6: 99, ex2: 99 },
        { studentId: 'LOLCA-2025-003', subject: 'Social and Environmental Studies', p1: 91, p2: 93, p3: 94, ex1: 96, p4: 94, p5: 96, p6: 97, ex2: 97 },
        { studentId: 'LOLCA-2025-003', subject: 'Christian Religious Education', p1: 98, p2: 99, p3: 100, ex1: 100, p4: 99, p5: 100, p6: 100, ex2: 100 }
      ],
      attendance: {
        'LOLCA-2025-001': { conduct: 'Very Good', absentDays: 1, absentWeeks: 0, absentMonths: 0, tardyDays: 2, tardyWeeks: 0, tardyMonths: 0 },
        'LOLCA-2025-002': { conduct: 'Good', absentDays: 3, absentWeeks: 0, absentMonths: 0, tardyDays: 1, tardyWeeks: 0, tardyMonths: 0 },
        'LOLCA-2025-003': { conduct: 'Very Good', absentDays: 0, absentWeeks: 0, absentMonths: 0, tardyDays: 0, tardyWeeks: 0, tardyMonths: 0 }
      },
      payments: [
        // Ezekiel Doe
        {
          paymentId: 'PAY-101',
          studentId: 'LOLCA-2025-001',
          paymentType: 'Tuition',
          paymentDescription: '1st Semester 1st Installment',
          receiptNumber: 'REC-2025-101',
          amount: 70,
          date: '2025-09-05',
          comments: 'Paid in full for Period 1',
          academicYear: '2025-2026',
          recordedBy: 'chrisnentorbor@gmail.com'
        },
        {
          paymentId: 'PAY-102',
          studentId: 'LOLCA-2025-001',
          paymentType: 'Tuition',
          paymentDescription: '1st Semester 2nd Installment',
          receiptNumber: 'REC-2025-142',
          amount: 30,
          date: '2025-10-10',
          comments: 'Part payment',
          academicYear: '2025-2026',
          recordedBy: 'chrisnentorbor@gmail.com'
        },
        {
          paymentId: 'PAY-103',
          studentId: 'LOLCA-2025-001',
          paymentType: 'Other Fees',
          paymentDescription: 'Registration and ID Card',
          receiptNumber: 'REC-2025-015',
          amount: 30,
          date: '2025-09-01',
          comments: 'Complete registration',
          academicYear: '2025-2026',
          recordedBy: 'chrisnentorbor@gmail.com'
        },
        // Grace Weah
        {
          paymentId: 'PAY-201',
          studentId: 'LOLCA-2025-002',
          paymentType: 'Tuition',
          paymentDescription: '1st Semester Initial Tuition',
          receiptNumber: 'REC-2025-201',
          amount: 80,
          date: '2025-09-08',
          comments: 'Bank deposit receipt #44921',
          academicYear: '2025-2026',
          recordedBy: 'chrisnentorbor@gmail.com'
        },
        {
          paymentId: 'PAY-202',
          studentId: 'LOLCA-2025-002',
          paymentType: 'Other Fees',
          paymentDescription: 'Registration & Student ID',
          receiptNumber: 'REC-2025-202',
          amount: 40,
          date: '2025-09-08',
          comments: 'Paid in full',
          academicYear: '2025-2026',
          recordedBy: 'chrisnentorbor@gmail.com'
        },
        // Samuel K. Johnson
        {
          paymentId: 'PAY-301',
          studentId: 'LOLCA-2025-003',
          paymentType: 'Tuition',
          paymentDescription: 'KI 1st Installment Tuition',
          receiptNumber: 'REC-2025-301',
          amount: 60,
          date: '2025-09-02',
          comments: 'Paid in Cash',
          academicYear: '2025-2026',
          recordedBy: 'chrisnentorbor@gmail.com'
        },
        {
          paymentId: 'PAY-302',
          studentId: 'LOLCA-2025-003',
          paymentType: 'Other Fees',
          paymentDescription: 'Preschool Activity & Materials',
          receiptNumber: 'REC-2025-302',
          amount: 35,
          date: '2025-09-02',
          comments: 'Complete other fee',
          academicYear: '2025-2026',
          recordedBy: 'chrisnentorbor@gmail.com'
        }
      ],
      auditLogs: [
        { logId: 'LOG-001', timestamp: new Date().toISOString(), actor: 'chrisnentorbor@gmail.com', action: 'SYSTEM_INITIALIZED', target: 'LOLCA System', outcome: 'SUCCESS', details: 'Initialized school management system with fees, requirements, and curriculum.' }
      ]
    };

    saveLocalDb_(seed);
    return seed;
  }

  function saveLocalDb_(db) {
    localStorage.setItem(LOCAL_STORAGE_DB_KEY, JSON.stringify(db));
  }

  function executeMockAction_(action, payload) {
    showLoader();
    return new Promise(resolve => {
      setTimeout(() => {
        hideLoader();
        const db = getLocalDb_();

        switch (action) {
          // AUTHENTICATION
          case 'adminLogin': {
            const email = String(payload.email || '').trim().toLowerCase();
            const password = String(payload.password || '').trim();
            const admin = db.admins.find(a => a.email.toLowerCase() === email);
            if (!admin) {
              return resolve({ success: false, message: 'Invalid administrator or teacher email.' });
            }
            if (admin.status !== 'Active') {
              return resolve({ success: false, message: 'Account is suspended.' });
            }
            // Allow admin or default admin123
            if (password && admin.password && password !== admin.password && password !== 'admin123' && password !== 'admin') {
              return resolve({ success: false, message: 'Invalid password. Please check your credentials.' });
            }

            if (admin.requires2FA || email === 'chrisnentorbor@gmail.com') {
              return resolve({
                success: true,
                requires2FA: true,
                tempToken: 'mock-2fa-' + Date.now(),
                email: email,
                message: `Verification code generated for ${email}. (Demo OTP: enter 123456 or 999888)`
              });
            }

            return resolve({
              success: true,
              requires2FA: false,
              sessionToken: 'token-' + admin.adminId,
              user: admin
            });
          }

          case 'verify2FA': {
            const code = String(payload.code || '').trim();
            if (code.length === 6) {
              const admin = db.admins.find(a => a.email.toLowerCase() === String(payload.email).toLowerCase()) || db.admins[0];
              return resolve({
                success: true,
                sessionToken: 'token-' + admin.adminId,
                user: admin
              });
            }
            return resolve({ success: false, message: 'Invalid 2FA code. Please enter 123456.' });
          }

          case 'studentLogin': {
            const id = String(payload.studentId || '').trim().toUpperCase();
            const password = String(payload.password || '').trim();
            if (!id) {
              return resolve({ success: false, message: 'Please enter your Student ID.' });
            }
            const student = db.students.find(s => s.studentId === id);
            if (!student) {
              return resolve({ success: false, message: `Student ID '${id}' not found in school database.` });
            }
            if (student.status !== 'Active') {
              return resolve({ success: false, message: 'Student account is suspended or transferred.' });
            }
            const correctPass = student.password || 'student123';
            if (password !== correctPass && password !== '123456') {
              return resolve({ success: false, message: 'Incorrect student password. Please verify your password.' });
            }

            return resolve({
              success: true,
              sessionToken: 'token-student-' + id,
              student: student
            });
          }

          case 'changeStudentPassword': {
            const studentId = String(payload.studentId || '').trim().toUpperCase();
            const oldPassword = String(payload.oldPassword || '').trim();
            const newPassword = String(payload.newPassword || '').trim();
            const student = db.students.find(s => s.studentId === studentId);
            if (!student) {
              return resolve({ success: false, message: 'Student profile not found.' });
            }
            const currentPass = student.password || 'student123';
            if (oldPassword !== currentPass && oldPassword !== '123456') {
              return resolve({ success: false, message: 'Current password is incorrect.' });
            }
            if (!newPassword || newPassword.length < 4) {
              return resolve({ success: false, message: 'New password must be at least 4 characters long.' });
            }
            student.password = newPassword;
            if (payload.photoUrl !== undefined) {
              student.photoUrl = payload.photoUrl;
            }
            saveLocalDb_(db);
            return resolve({ success: true, student: student, message: 'Account settings and password updated successfully!' });
          }

          // STUDENTS REGISTRY
          case 'getStudents': {
            let list = [...db.students];
            if (payload.search) {
              const q = payload.search.toLowerCase();
              list = list.filter(s => s.studentId.toLowerCase().includes(q) || s.fullName.toLowerCase().includes(q) || (s.guardianName && s.guardianName.toLowerCase().includes(q)));
            }
            if (payload.class && payload.class !== 'All') {
              list = list.filter(s => s.class.toLowerCase() === payload.class.toLowerCase());
            }
            return resolve({ success: true, total: list.length, students: list });
          }

          case 'getStudent': {
            const s = db.students.find(st => st.studentId === payload.studentId);
            return resolve(s ? { success: true, student: s } : { success: false, message: 'Student not found.' });
          }

          case 'addStudent': {
            const count = db.students.length + 1;
            const newId = payload.studentId || `LOLCA-2025-${String(count).padStart(3, '0')}`;
            const student = {
              studentId: newId,
              fullName: payload.fullName,
              gender: payload.gender || 'Male',
              class: payload.class,
              dob: payload.dob || '',
              guardianName: payload.guardianName || '',
              guardianPhone: payload.guardianPhone || '',
              guardianEmail: payload.guardianEmail || '',
              address: payload.address || '',
              enrollmentDate: payload.enrollmentDate || new Date().toISOString().split('T')[0],
              academicYear: payload.academicYear || '2025-2026',
              status: payload.status || 'Active',
              password: payload.password ? String(payload.password).trim() : 'student123',
              photoUrl: payload.photoUrl || ''
            };
            db.students.push(student);
            db.auditLogs.push({
              logId: 'LOG-' + Date.now(),
              timestamp: new Date().toISOString(),
              actor: 'Administrator',
              action: 'STUDENT_ENROLLED',
              target: newId,
              outcome: 'SUCCESS',
              details: `Enrolled ${student.fullName} into ${student.class} with initial password.`
            });
            saveLocalDb_(db);
            return resolve({ success: true, student: student, message: `Student enrolled successfully with ID: ${newId}.` });
          }

          case 'updateStudent': {
            const idx = db.students.findIndex(s => s.studentId === payload.studentId);
            if (idx === -1) return resolve({ success: false, message: 'Student not found.' });
            Object.assign(db.students[idx], payload);
            saveLocalDb_(db);
            return resolve({ success: true, student: db.students[idx], message: 'Student record updated.' });
          }

          case 'deleteStudent': {
            const idx = db.students.findIndex(s => s.studentId === payload.studentId);
            if (idx === -1) return resolve({ success: false, message: 'Student not found.' });
            db.students.splice(idx, 1);
            saveLocalDb_(db);
            return resolve({ success: true, message: 'Student record deleted.' });
          }

          // CLASS MARKSHEET (FILTERED BY CLASS AND SUBJECT)
          case 'getClassMarksheet': {
            const className = String(payload.className || payload.class || '').trim();
            const subject = String(payload.subject || '').trim();
            if (!className) return resolve({ success: false, message: 'Class name is required.' });

            const classStudents = db.students.filter(s => s.class.toLowerCase() === className.toLowerCase() && s.status === 'Active');
            const marksheet = classStudents.map(st => {
              const rec = db.grades.find(g => g.studentId === st.studentId && g.subject.toLowerCase() === subject.toLowerCase());
              return {
                studentId: st.studentId,
                fullName: st.fullName,
                class: st.class,
                photoUrl: st.photoUrl || '',
                subject: subject,
                p1: (rec && rec.p1 !== undefined && rec.p1 !== null) ? rec.p1 : '',
                p2: (rec && rec.p2 !== undefined && rec.p2 !== null) ? rec.p2 : '',
                p3: (rec && rec.p3 !== undefined && rec.p3 !== null) ? rec.p3 : '',
                ex1: (rec && rec.ex1 !== undefined && rec.ex1 !== null) ? rec.ex1 : '',
                p4: (rec && rec.p4 !== undefined && rec.p4 !== null) ? rec.p4 : '',
                p5: (rec && rec.p5 !== undefined && rec.p5 !== null) ? rec.p5 : '',
                p6: (rec && rec.p6 !== undefined && rec.p6 !== null) ? rec.p6 : '',
                ex2: (rec && rec.ex2 !== undefined && rec.ex2 !== null) ? rec.ex2 : ''
              };
            });

            return resolve({
              success: true,
              className: className,
              subject: subject,
              count: marksheet.length,
              marksheet: marksheet
            });
          }

          case 'saveStudentSubjectGrade': {
            const studentId = String(payload.studentId || '').trim().toUpperCase();
            const subject = String(payload.subject || '').trim();
            if (!studentId || !subject) return resolve({ success: false, message: 'Student ID and Subject are required.' });

            let record = db.grades.find(g => g.studentId === studentId && g.subject.toLowerCase() === subject.toLowerCase());
            if (!record) {
              record = { studentId: studentId, subject: subject };
              db.grades.push(record);
            }

            ['p1', 'p2', 'p3', 'ex1', 'p4', 'p5', 'p6', 'ex2'].forEach(field => {
              if (payload[field] !== undefined) {
                record[field] = payload[field] === '' ? '' : Number(payload[field]);
              }
            });

            if (payload.conduct || payload.absentDays !== undefined || payload.tardyDays !== undefined) {
              db.attendance[studentId] = {
                conduct: payload.conduct || 'Very Good',
                absentDays: Number(payload.absentDays) || 0,
                absentWeeks: Number(payload.absentWeeks) || 0,
                absentMonths: Number(payload.absentMonths) || 0,
                tardyDays: Number(payload.tardyDays) || 0,
                tardyWeeks: Number(payload.tardyWeeks) || 0,
                tardyMonths: Number(payload.tardyMonths) || 0
              };
            }

            saveLocalDb_(db);
            return resolve({ success: true, message: `Grades saved for ${subject}!` });
          }

          case 'saveClassMarksheetBatch': {
            const subject = String(payload.subject || '').trim();
            const records = Array.isArray(payload.records) ? payload.records : [];
            if (!subject) return resolve({ success: false, message: 'Subject is required.' });

            records.forEach(row => {
              const studentId = String(row.studentId || '').trim().toUpperCase();
              if (!studentId) return;

              let rec = db.grades.find(g => g.studentId === studentId && g.subject.toLowerCase() === subject.toLowerCase());
              if (!rec) {
                rec = { studentId: studentId, subject: subject };
                db.grades.push(rec);
              }
              ['p1', 'p2', 'p3', 'ex1', 'p4', 'p5', 'p6', 'ex2'].forEach(f => {
                if (row[f] !== undefined) {
                  rec[f] = row[f] === '' ? '' : Number(row[f]);
                }
              });
            });

            saveLocalDb_(db);
            return resolve({ success: true, message: `Successfully saved marksheet for ${records.length} students in ${subject}.` });
          }

          // OFFICIAL REPORT CARD GENERATION (PRESCHOOL VS ELEMENTARY)
          case 'getStudentGradeReport': {
            const studentId = String(payload.studentId || '').trim().toUpperCase();
            const student = db.students.find(s => s.studentId === studentId);
            if (!student) return resolve({ success: false, message: 'Student profile not found.' });

            // Nursery, KI, KII are strictly Preschool; 1st-6th are Elementary
            const preschoolClasses = window.APP_CONFIG.preschoolClasses || ["Nursery", "KI", "KII"];
            const isPreschool = preschoolClasses.map(c => c.toLowerCase()).includes(student.class.toLowerCase());
            const curriculum = isPreschool
              ? (db.preschoolCurriculum || window.APP_CONFIG.preschoolCurriculum)
              : (db.elementaryCurriculum || window.APP_CONFIG.elementaryCurriculum);

            const reportCategories = [];
            let grandTotalSem1 = 0;
            let grandTotalSem2 = 0;
            let completedSem1Count = 0;
            let completedSem2Count = 0;
            let totalSubjectCount = 0;

            for (const [categoryName, subjectList] of Object.entries(curriculum)) {
              const rows = [];
              for (const subj of subjectList) {
                totalSubjectCount++;
                let record = db.grades.find(g => g.studentId === studentId && g.subject.toLowerCase() === subj.toLowerCase());

                // Read individual periods
                const p1 = (record && record.p1 !== undefined && record.p1 !== '') ? Number(record.p1) : '';
                const p2 = (record && record.p2 !== undefined && record.p2 !== '') ? Number(record.p2) : '';
                const p3 = (record && record.p3 !== undefined && record.p3 !== '') ? Number(record.p3) : '';
                const ex1 = (record && record.ex1 !== undefined && record.ex1 !== '') ? Number(record.ex1) : '';

                const p4 = (record && record.p4 !== undefined && record.p4 !== '') ? Number(record.p4) : '';
                const p5 = (record && record.p5 !== undefined && record.p5 !== '') ? Number(record.p5) : '';
                const p6 = (record && record.p6 !== undefined && record.p6 !== '') ? Number(record.p6) : '';
                const ex2 = (record && record.ex2 !== undefined && record.ex2 !== '') ? Number(record.ex2) : '';

                // Calculate semester 1 average only if scores exist
                const sem1Scores = [p1, p2, p3, ex1].filter(v => v !== '');
                const sem1Ave = sem1Scores.length ? Math.round(sem1Scores.reduce((a, b) => a + Number(b), 0) / sem1Scores.length) : '';

                // Calculate semester 2 average only if scores exist
                const sem2Scores = [p4, p5, p6, ex2].filter(v => v !== '');
                const sem2Ave = sem2Scores.length ? Math.round(sem2Scores.reduce((a, b) => a + Number(b), 0) / sem2Scores.length) : '';

                // Yearly average
                let yrAve = '';
                if (sem1Ave !== '' && sem2Ave !== '') {
                  yrAve = Math.round((sem1Ave + sem2Ave) / 2);
                } else if (sem1Ave !== '') {
                  yrAve = sem1Ave;
                } else if (sem2Ave !== '') {
                  yrAve = sem2Ave;
                }

                if (sem1Ave !== '') {
                  grandTotalSem1 += sem1Ave;
                  completedSem1Count++;
                }
                if (sem2Ave !== '') {
                  grandTotalSem2 += sem2Ave;
                  completedSem2Count++;
                }

                rows.push({
                  subject: subj,
                  p1: p1,
                  p2: p2,
                  p3: p3,
                  ex1: ex1,
                  sem1Ave: sem1Ave,
                  p4: p4,
                  p5: p5,
                  p6: p6,
                  ex2: ex2,
                  sem2Ave: sem2Ave,
                  yrAve: yrAve
                });
              }

              reportCategories.push({
                category: categoryName,
                rows: rows
              });
            }

            const attendance = db.attendance[studentId] || { conduct: 'Very Good', absentDays: 0, absentWeeks: 0, absentMonths: 0, tardyDays: 0, tardyWeeks: 0, tardyMonths: 0 };
            const classRoster = db.students.filter(s => s.class === student.class);

            const overallSem1Ave = completedSem1Count ? Math.round(grandTotalSem1 / completedSem1Count) : '';
            const overallSem2Ave = completedSem2Count ? Math.round(grandTotalSem2 / completedSem2Count) : '';
            const overallYearAve = (overallSem1Ave !== '' && overallSem2Ave !== '')
              ? Math.round((overallSem1Ave + overallSem2Ave) / 2)
              : (overallSem1Ave !== '' ? overallSem1Ave : (overallSem2Ave !== '' ? overallSem2Ave : ''));

            // Progression grade logic
            const progressionMap = {
              'Nursery': 'KI',
              'KI': 'KII',
              'KII': '1st Grade',
              '1st Grade': '2nd Grade',
              '2nd Grade': '3rd Grade',
              '3rd Grade': '4th Grade',
              '4th Grade': '5th Grade',
              '5th Grade': '6th Grade',
              '6th Grade': '7th Grade (Junior High)'
            };
            const nextGrade = progressionMap[student.class] || 'Next Grade';

            return resolve({
              success: true,
              student: student,
              isPreschool: isPreschool,
              reportType: isPreschool ? 'PRE-GRADE' : 'ELEMENTARY',
              academicYear: student.academicYear || '2025-2026',
              categories: reportCategories,
              attendance: attendance,
              summary: {
                totalSubjects: totalSubjectCount,
                sem1Average: overallSem1Ave !== '' ? overallSem1Ave : '—',
                sem2Average: overallSem2Ave !== '' ? overallSem2Ave : '—',
                yearAverage: overallYearAve !== '' ? overallYearAve : '—',
                classTotal: classRoster.length,
                isPromoted: overallYearAve !== '' && overallYearAve >= 70,
                promotionGrade: nextGrade
              }
            });
          }

          // FEES SCHEDULE & REQUIREMENTS
          case 'getFeesSchedule': {
            const fees = db.classFees || window.APP_CONFIG.classFees || {};
            return resolve({ success: true, fees: fees });
          }

          case 'updateClassFee': {
            const className = payload.class;
            if (!className) return resolve({ success: false, message: 'Class name is required.' });

            if (!db.classFees) db.classFees = {};
            const tuition = Number(payload.tuition) || 0;
            const other = Number(payload.other) || 0;
            const total = (payload.total !== undefined && payload.total !== '') ? Number(payload.total) : (tuition + other);

            db.classFees[className] = {
              tuition: tuition,
              other: other,
              total: total,
              academicYear: payload.academicYear || '2025-2026',
              requirements: payload.requirements || ''
            };
            saveLocalDb_(db);
            return resolve({ success: true, fees: db.classFees, message: `Fee schedule & requirements for ${className} updated successfully.` });
          }

          // STUDENT PAYMENTS & HALF-A4 RECEIPT DATA
          case 'getStudentPayments': {
            const studentId = String(payload.studentId || '').trim().toUpperCase();
            const student = db.students.find(s => s.studentId === studentId);
            if (!student) return resolve({ success: false, message: 'Student not found.' });

            // Dynamically look up class fee tied to student's class
            const allFees = db.classFees || window.APP_CONFIG.classFees || {};
            const classFeeInfo = allFees[student.class] || { tuition: 120, other: 30, total: 150, requirements: 'Standard School Uniform, Notebooks, and Textbooks' };

            const studentPayments = (db.payments || []).filter(p => p.studentId === studentId);
            const tuitionPayments = studentPayments.filter(p => p.paymentType === 'Tuition');
            const otherPayments = studentPayments.filter(p => p.paymentType === 'Other Fees');

            const totalTuitionPaid = tuitionPayments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
            const totalOtherPaid = otherPayments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
            const grandTotalPaid = totalTuitionPaid + totalOtherPaid;
            const balanceDue = Math.max(0, classFeeInfo.total - grandTotalPaid);

            return resolve({
              success: true,
              student: student,
              feeStructure: {
                tuitionFee: classFeeInfo.tuition,
                otherFees: classFeeInfo.other,
                totalFees: classFeeInfo.total,
                academicYear: classFeeInfo.academicYear || student.academicYear || '2025-2026',
                requirements: classFeeInfo.requirements || 'Standard uniform and class materials'
              },
              tuitionPayments: tuitionPayments,
              otherPayments: otherPayments,
              allPayments: studentPayments,
              summary: {
                totalFeesAssessed: classFeeInfo.total,
                totalTuitionAssessed: classFeeInfo.tuition,
                totalOtherAssessed: classFeeInfo.other,
                totalTuitionPaid: totalTuitionPaid,
                totalOtherPaid: totalOtherPaid,
                grandTotalPaid: grandTotalPaid,
                tuitionBalance: Math.max(0, classFeeInfo.tuition - totalTuitionPaid),
                otherBalance: Math.max(0, classFeeInfo.other - totalOtherPaid),
                balanceDue: balanceDue,
                paymentStatus: balanceDue <= 0 ? 'PAID IN FULL' : (grandTotalPaid > 0 ? 'PARTIAL' : 'UNPAID')
              }
            });
          }

          case 'recordPayment': {
            const studentId = String(payload.studentId || '').trim().toUpperCase();
            const student = db.students.find(s => s.studentId === studentId);
            if (!student) return resolve({ success: false, message: 'Student not found.' });

            const receiptNum = payload.receiptNumber || 'REC-' + Math.floor(100000 + Math.random() * 900000);
            const paymentItem = {
              paymentId: 'PAY-' + Date.now(),
              studentId: studentId,
              paymentType: payload.paymentType || 'Tuition',
              paymentDescription: payload.paymentDescription || 'Tuition Payment',
              receiptNumber: receiptNum,
              amount: Number(payload.amount) || 0,
              date: payload.date || new Date().toISOString().split('T')[0],
              comments: payload.comments || '',
              academicYear: payload.academicYear || student.academicYear || '2025-2026',
              recordedBy: payload.recordedBy || 'Admin'
            };

            db.payments.push(paymentItem);
            db.auditLogs.push({
              logId: 'LOG-' + Date.now(),
              timestamp: new Date().toISOString(),
              actor: paymentItem.recordedBy,
              action: 'PAYMENT_RECORDED',
              target: studentId,
              outcome: 'SUCCESS',
              details: `Received $${paymentItem.amount} (${paymentItem.paymentType}) for ${student.fullName}. Receipt #${receiptNum}`
            });
            saveLocalDb_(db);

            return executeMockAction_('getStudentPayments', { studentId: studentId });
          }

          case 'getAllPayments': {
            return resolve({ success: true, payments: db.payments });
          }

          // SUBJECTS & CURRICULUM MANAGEMENT
          case 'getSubjects': {
            return resolve({
              success: true,
              preschoolCurriculum: db.preschoolCurriculum || window.APP_CONFIG.preschoolCurriculum,
              elementaryCurriculum: db.elementaryCurriculum || window.APP_CONFIG.elementaryCurriculum
            });
          }

          case 'addSubject': {
            const level = payload.level; // 'preschool' or 'elementary'
            const category = String(payload.category || '').trim().toUpperCase();
            const subjectName = String(payload.subjectName || '').trim();

            if (!subjectName || !category) {
              return resolve({ success: false, message: 'Subject name and category are required.' });
            }

            const targetCurriculum = level === 'preschool' ? db.preschoolCurriculum : db.elementaryCurriculum;
            if (!targetCurriculum[category]) {
              targetCurriculum[category] = [];
            }
            if (!targetCurriculum[category].includes(subjectName)) {
              targetCurriculum[category].push(subjectName);
            }

            saveLocalDb_(db);
            return resolve({ success: true, message: `Subject '${subjectName}' added to ${category}.` });
          }

          case 'updateSubject': {
            const level = payload.level; // 'preschool' or 'elementary'
            const oldCategory = String(payload.oldCategory || '').trim().toUpperCase();
            const newCategory = String(payload.newCategory || oldCategory).trim().toUpperCase();
            const oldName = String(payload.oldName || '').trim();
            const newName = String(payload.newName || oldName).trim();

            const targetCurriculum = level === 'preschool' ? db.preschoolCurriculum : db.elementaryCurriculum;
            if (targetCurriculum[oldCategory]) {
              targetCurriculum[oldCategory] = targetCurriculum[oldCategory].filter(s => s !== oldName);
              if (targetCurriculum[oldCategory].length === 0 && oldCategory !== newCategory) {
                delete targetCurriculum[oldCategory];
              }
            }
            if (!targetCurriculum[newCategory]) targetCurriculum[newCategory] = [];
            if (!targetCurriculum[newCategory].includes(newName)) targetCurriculum[newCategory].push(newName);

            // Update in grades table too
            db.grades.forEach(g => {
              if (g.subject.toLowerCase() === oldName.toLowerCase()) {
                g.subject = newName;
              }
            });

            saveLocalDb_(db);
            return resolve({ success: true, message: `Subject updated successfully.` });
          }

          case 'deleteSubject': {
            const level = payload.level;
            const category = String(payload.category || '').trim().toUpperCase();
            const subjectName = String(payload.subjectName || '').trim();

            const targetCurriculum = level === 'preschool' ? db.preschoolCurriculum : db.elementaryCurriculum;
            if (targetCurriculum[category]) {
              targetCurriculum[category] = targetCurriculum[category].filter(s => s.toLowerCase() !== subjectName.toLowerCase());
              if (targetCurriculum[category].length === 0) {
                delete targetCurriculum[category];
              }
            }

            saveLocalDb_(db);
            return resolve({ success: true, message: `Subject '${subjectName}' removed.` });
          }

          // ADMINS & TEACHERS
          case 'getAdmins': {
            return resolve({ success: true, admins: db.admins });
          }

          case 'addAdmin': {
            const adminId = 'ADM-' + String(db.admins.length + 1).padStart(3, '0');
            const newAdmin = {
              adminId: adminId,
              email: payload.email,
              fullName: payload.fullName,
              role: payload.role || 'Teacher',
              permissions: payload.permissions || ['manage_grades'],
              assignedClasses: payload.assignedClasses || ['4th Grade'],
              assignedSubjects: payload.assignedSubjects || ['Grammar'],
              status: payload.status || 'Active',
              requires2FA: Boolean(payload.requires2FA),
              phone: payload.phone || '',
              password: payload.password || 'teacher123',
              photoUrl: payload.photoUrl || '',
              createdAt: new Date().toISOString()
            };
            db.admins.push(newAdmin);
            saveLocalDb_(db);
            return resolve({ success: true, adminId: adminId, message: 'Staff user created successfully.' });
          }

          case 'updateAdmin': {
            const idx = db.admins.findIndex(a => a.adminId === payload.adminId);
            if (idx === -1) return resolve({ success: false, message: 'Admin not found.' });
            Object.assign(db.admins[idx], payload);
            saveLocalDb_(db);
            return resolve({ success: true, message: 'Staff user updated.' });
          }

          case 'deleteAdmin': {
            const admin = db.admins.find(a => a.adminId === payload.adminId);
            if (admin && admin.email.toLowerCase() === 'chrisnentorbor@gmail.com') {
              return resolve({ success: false, message: 'Super Admin cannot be deleted.' });
            }
            db.admins = db.admins.filter(a => a.adminId !== payload.adminId);
            saveLocalDb_(db);
            return resolve({ success: true, message: 'Admin removed.' });
          }

          case 'getAuditLogs': {
            return resolve({ success: true, logs: db.auditLogs });
          }

          default:
            return resolve({ success: true, message: 'Action completed.' });
        }
      }, 150);
    });
  }

  return {
    getBackendUrl,
    request,
    showLoader,
    hideLoader,
    toast,
    toastSuccess: msg => toast(msg || 'Success', false),
    toastError: msg => toast(msg || 'Error occurred', true),
    getSessionToken,
    setSessionToken,
    getCurrentUser,
    setCurrentUser,
    clearSession
  };
})();

if (typeof window !== 'undefined') {
  window.API = API;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = API;
}
