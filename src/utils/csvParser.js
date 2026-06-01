import Papa from 'papaparse';

/**
 * Normalizes insurance name to abbreviation
 */
export function normalizeInsurance(insuranceName) {
  if (!insuranceName) return '';
  const ins = insuranceName.toUpperCase();
  
  if (ins.includes('UNITED MEDICARE') || ins.includes('UNITEDMEDICARE') || ins.includes('UMC')) {
    return 'UMC';
  }
  if (ins.includes('MEDICARE CO') || ins.includes('MEDICARE')) {
    return 'MC';
  }
  if (ins.includes('CIGNA')) {
    return 'CIGNA';
  }
  if (ins.includes('BLUE CROSS') || ins.includes('BCBS') || ins.includes('BC')) {
    return 'BCBS';
  }
  if (ins.includes('HUMANA')) {
    return 'HUMANA';
  }
  if (ins.includes('AETNA')) {
    return 'AETNA';
  }
  if (ins.includes('UMR')) {
    return 'UMR';
  }
  
  // Return first 5 characters uppercase as fallback
  return ins.replace(/[^A-Z0-9]/g, '').substring(0, 5);
}

/**
 * Guesses default facility based on insurance and reason
 */
export function guessFacility(insuranceAbbr, reason) {
  return guessFacilityWithReason(insuranceAbbr, reason).facility;
}

/**
 * Guesses default facility and explains the detection logic
 */
export function guessFacilityWithReason(insuranceAbbr, reason) {
  const normalizedIns = (insuranceAbbr || '').toUpperCase();
  const normalizedReason = (reason || '').toUpperCase();
  
  // If reason mentions certain keywords, guess accordingly
  if (normalizedReason.includes('AMBRA') || normalizedReason.includes('CLOUD')) {
    return { facility: 'AMBRA', reason: "Detection: Matched keyword 'AMBRA'/'CLOUD' in Reason" };
  }
  if (normalizedReason.includes('BCH') || normalizedReason.includes('BOULDER')) {
    return { facility: 'BCH', reason: "Detection: Matched keyword 'BCH'/'BOULDER' in Reason" };
  }
  if (normalizedReason.includes('HI') || normalizedReason.includes('HEALTH IMAGES')) {
    return { facility: 'HI', reason: "Detection: Matched keyword 'HI'/'HEALTH IMAGES' in Reason" };
  }

  // Based on the provided TIMETABLE.pdf distribution:
  // - UMC (United) frequently goes to Health Images (HI) or AMBRA
  // - MC (Medicare) goes to BCH (Boulder Community Health), HI (Health Images), or AMBRA
  // Let's provide a balanced default:
  if (normalizedIns === 'UMC') return { facility: 'HI', reason: "Detection: Guessed from insurance 'UMC'" };
  if (normalizedIns === 'MC') return { facility: 'BCH', reason: "Detection: Guessed from insurance 'MC'" };
  if (normalizedIns === 'CIGNA') return { facility: 'BCH', reason: "Detection: Guessed from insurance 'CIGNA'" };
  if (normalizedIns === 'UMR') return { facility: 'HI', reason: "Detection: Guessed from insurance 'UMR'" };
  
  return { facility: 'HI', reason: "Detection: Default fallback facility" };
}

/**
 * Cleans the appointment Reason text
 */
export function cleanReason(reason) {
  if (!reason) return '';
  let cleaned = reason.trim();
  
  // Remove leading single quotes or asterisks often found in exports
  cleaned = cleaned.replace(/^['*-]+/, '');
  
  // Clean common prefixes
  cleaned = cleaned.replace(/^F\/UP:\s*/i, '');
  cleaned = cleaned.replace(/^FOLLOW UP\s*\+?\s*/i, '');
  cleaned = cleaned.replace(/^f\/up\s*\+?\s*/i, '');
  
  return cleaned;
}

/**
 * Cleans and formats the date from MM/DD/YYYY or YYYY-MM-DD to M/D/YYYY
 */
export function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr.replace(/-/g, '/'));
    if (isNaN(d.getTime())) return dateStr;
    return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
  } catch (e) {
    return dateStr;
  }
}

/**
 * Parse eClinicalWorks CSV patient demographics export
 * @param {string} csvText - Raw CSV file contents
 * @returns {Promise<Array>} - Array of parsed patient objects
 */
export function parseDemographicsCSV(csvText) {
  return new Promise((resolve, reject) => {
    Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const parsedRecords = results.data.map((row, index) => {
            const birthdate = formatDate(row['Pat Birthdate']);
            const patNo = row['Pat #'] || '';
            const firstName = row['Pat F Name'] || '';
            const lastName = row['Pat L Name'] || '';
            const time = row['Time'] || '';
            const rawReason = row['Reason'] || '';
            const apptType = row['Appt Type'] || '';
            const rawInsurance = row['Primary Insurance Name'] || '';
            
            const insurance = normalizeInsurance(rawInsurance);
            const reason = cleanReason(rawReason);
            const { facility, reason: facilityReason } = guessFacilityWithReason(insurance, reason);
            
            // Default to including all appointments in the timetable
            const isProcedure = true;
            
            return {
              id: `row-${index}-${Date.now()}`,
              birthdate,
              patNo,
              firstName,
              lastName,
              time,
              reason,
              insurance,
              facility,
              facilityReason,
              apptType,
              medCount: '',
              isProcedure, // Used for default filtering/toggling
              originalRow: row // Preserve full data in case needed
            };
          });
          
          // Sort by time chronologically
          parsedRecords.sort((a, b) => {
            if (!a.time || !b.time) return 0;
            // Simple parse of "HH:MM AM/PM" to minutes from midnight
            const parseToMinutes = (tStr) => {
              const match = tStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
              if (!match) return 0;
              let hrs = parseInt(match[1], 10);
              const mins = parseInt(match[2], 10);
              const meridian = match[3].toUpperCase();
              if (meridian === 'PM' && hrs !== 12) hrs += 12;
              if (meridian === 'AM' && hrs === 12) hrs = 0;
              return hrs * 60 + mins;
            };
            return parseToMinutes(a.time) - parseToMinutes(b.time);
          });
          
          resolve(parsedRecords);
        } catch (error) {
          reject(error);
        }
      },
      error: (err) => {
        reject(err);
      }
    });
  });
}
