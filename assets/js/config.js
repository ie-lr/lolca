/**
 * config.js
 * -----------------------------------------------------------------------
 * Light of Life Christian Academy (LOLCA) School Configuration
 * -----------------------------------------------------------------------
 */

window.APP_CONFIG = {
  // Backend Google Apps Script Web App URL (paste your deployed Apps Script URL here, e.g. "https://script.google.com/macros/s/.../exec")
    backendUrl: "https://script.google.com/macros/s/AKfycbz3UwuOwE6nHqYwkyj_8L1rus8Qr2hgwFIzv5fGre8eR2KGp3vYYmw9dgYMpEgQxKHv4g/exec",


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

  // Standard Class Fee Schedules (Tuition, Other Fees, Total, and Class Requirements)
  classFees: {
    "Nursery": {
      tuition: 90,
      other: 30,
      total: 120,
      academicYear: "2025-2026",
      requirements: "2 Packs of Crayons, 3 Exercise Notebooks, Uniform (Navy blue & white), 1 Box of Pencils, Plastic Folder"
    },
    "KI": {
      tuition: 95,
      other: 35,
      total: 130,
      academicYear: "2025-2026",
      requirements: "2 Coloring Books, 3 Exercise Notebooks, Uniform, Safety Scissors, Pencils, Erasers"
    },
    "KII": {
      tuition: 100,
      other: 35,
      total: 135,
      academicYear: "2025-2026",
      requirements: "Beginner Reader, 4 Notebooks, Uniform, Pencils, Erasers, Crayons, Plastic Ruler"
    },
    "1st Grade": {
      tuition: 110,
      other: 40,
      total: 150,
      academicYear: "2025-2026",
      requirements: "6 Standard Notebooks, English & Math Textbooks, Complete School Uniform, Mathematical Set"
    },
    "2nd Grade": {
      tuition: 120,
      other: 40,
      total: 160,
      academicYear: "2025-2026",
      requirements: "6 Standard Notebooks, Primary Readers, School Uniform, 30cm Ruler, Pencils and Blue/Black Pens"
    },
    "3rd Grade": {
      tuition: 125,
      other: 45,
      total: 170,
      academicYear: "2025-2026",
      requirements: "8 Notebooks, Elementary Dictionary, Complete Uniform, Mathematical Instrument Box, Physical Education kit"
    },
    "4th Grade": {
      tuition: 130,
      other: 50,
      total: 180,
      academicYear: "2025-2026",
      requirements: "8 Notebooks, Oxford English/Math textbooks, Complete School Uniform, Geometry Set, PE Uniform"
    },
    "5th Grade": {
      tuition: 140,
      other: 50,
      total: 190,
      academicYear: "2025-2026",
      requirements: "10 Notebooks, Science & Social Studies textbooks, Complete Uniform, Geometry Set, PE Uniform"
    },
    "6th Grade": {
      tuition: 150,
      other: 50,
      total: 200,
      academicYear: "2025-2026",
      requirements: "10 Notebooks, National Exam prep materials, Complete Uniform, Geometry Set, Physical Education attire"
    }
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = (typeof window !== 'undefined' ? window.APP_CONFIG : null);
}
