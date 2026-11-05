/**
 * config.js
 * -----------------------------------------------------------------------
 * Light of Life Christian Academy (LOLCA) School Configuration
 * -----------------------------------------------------------------------
 */

window.APP_CONFIG = {
  // Backend Google Apps Script Web App URL (leave empty for instant local mock mode)
  backendUrl: "",

  schoolName: "Light of Life Christian Academy (LOLCA)",
  schoolShortName: "LOLCA",
  motto: "Assuring Full Life Through Sound Academic and Spiritual Education",
  campusLocation: "Wakor Junction, Light Community, Jlazon, Lower Margibi / Montserrado County, Republic of Liberia",
  contactPhones: "0778240169 / 0886383455 / 0777908308",
  contactWhatsApp: "0776277517",
  contactEmail: "bavidngombu15@gmail.com",
  primaryAdminEmail: "chrisnentorbor@gmail.com",
  established: "2025",
  academicYear: "2025-2026",

  // Official 9 Classes
  classes: [
    "Nursery",
    "KI",
    "KII",
    "1st Grade",
    "2nd Grade",
    "3rd Grade",
    "4th Grade",
    "5th Grade",
    "6th Grade"
  ],

  // Pre-school vs Elementary category definitions
  preschoolClasses: ["Nursery", "KI", "KII"],
  elementaryClasses: ["1st Grade", "2nd Grade", "3rd Grade", "4th Grade", "5th Grade", "6th Grade"],

  // Pre-Grade Subject Structure
  preschoolCurriculum: {
    "LITERACY": [
      "Reading",
      "Recognizing Letters",
      "Writing Letters",
      "Spelling",
      "Speech-Work",
      "Handwriting"
    ],
    "NUMERACY": [
      "Reading Numbers",
      "Recognizing Numbers",
      "Writing Numbers",
      "Spelling Numbers"
    ],
    "SCIENCE": [
      "Natural Science",
      "Physical and Health Science"
    ],
    "SOCIAL STUDIES": [
      "Social and Environmental Studies",
      "Christian Religious Education"
    ]
  },

  // Elementary Subject Structure
  elementaryCurriculum: {
    "ENGLISH LANGUAGE": [
      "Grammar",
      "Reading Comprehension",
      "Composition",
      "Spelling",
      "Vocabulary"
    ],
    "MATHEMATICS": [
      "Arithmetic",
      "Geometry",
      "Pre-Algebra"
    ],
    "SCIENCE": [
      "Physical and Health Education",
      "Information Technology",
      "Agriculture"
    ],
    "SOCIAL STUDIES": [
      "History",
      "Home Economics",
      "Social and Environment Studies",
      "Civics",
      "Christian Religious Education"
    ]
  },

  // Standard Class Fee Schedules (Tuition, Other Fees, Total)
  classFees: {
    "Nursery": { tuition: 90, other: 30, total: 120 },
    "KI": { tuition: 95, other: 35, total: 130 },
    "KII": { tuition: 100, other: 35, total: 135 },
    "1st Grade": { tuition: 110, other: 40, total: 150 },
    "2nd Grade": { tuition: 120, other: 40, total: 160 },
    "3rd Grade": { tuition: 125, other: 45, total: 170 },
    "4th Grade": { tuition: 130, other: 50, total: 180 },
    "5th Grade": { tuition: 140, other: 50, total: 190 },
    "6th Grade": { tuition: 150, other: 50, total: 200 }
  }
};
