// Optional listing details collected by the owner listing form.
// Each value is validated against a whitelist; `undefined` means "not sent".

const PROPERTY_TYPES = ["Dormitory", "Apartment", "Private Room"];
const DISTANCES = [
  "Less than 100m", "100m - 300m", "300m - 500m", "500m - 1km", "1km - 2km",
  "2km - 3km", "3km - 5km", "5km - 10km", "More than 10km",
];
const MIN_STAYS = [1, 3, 6, 12];
const RULE_KEYS = ["noSmoking", "noPets", "curfew"];

/**
 * @param {object} body - request body
 * @returns {{ error?: string, values: { university, property_type, distance_to_university, min_stay_months, house_rules } }}
 */
function parseListingDetails(body = {}) {
  const values = {};
  const blank = (v) => v === null || (typeof v === "string" && v.trim() === "");

  if (body.university !== undefined) {
    if (blank(body.university)) values.university = null;
    else if (typeof body.university !== "string" || body.university.trim().length > 200) {
      return { error: "University must be at most 200 characters.", values };
    } else values.university = body.university.trim();
  }

  if (body.property_type !== undefined) {
    if (blank(body.property_type)) values.property_type = null;
    else if (!PROPERTY_TYPES.includes(body.property_type)) {
      return { error: `Property type must be one of: ${PROPERTY_TYPES.join(", ")}.`, values };
    } else values.property_type = body.property_type;
  }

  if (body.distance_to_university !== undefined) {
    if (blank(body.distance_to_university)) values.distance_to_university = null;
    else if (!DISTANCES.includes(body.distance_to_university)) {
      return { error: "Distance to university is not a valid option.", values };
    } else values.distance_to_university = body.distance_to_university;
  }

  if (body.min_stay_months !== undefined) {
    if (blank(body.min_stay_months)) values.min_stay_months = null;
    else {
      const months = Number(body.min_stay_months);
      if (!MIN_STAYS.includes(months)) {
        return { error: `Minimum stay must be one of: ${MIN_STAYS.join(", ")} months.`, values };
      }
      values.min_stay_months = months;
    }
  }

  if (body.house_rules !== undefined) {
    let rules = body.house_rules;
    if (typeof rules === "string") {
      try { rules = JSON.parse(rules); } catch { return { error: "House rules are invalid.", values }; }
    }
    if (rules === null || typeof rules !== "object" || Array.isArray(rules)) {
      return { error: "House rules are invalid.", values };
    }
    values.house_rules = Object.fromEntries(RULE_KEYS.map((key) => [key, rules[key] === true]));
  }

  return { values };
}

module.exports = { parseListingDetails, PROPERTY_TYPES, DISTANCES, MIN_STAYS, RULE_KEYS };
