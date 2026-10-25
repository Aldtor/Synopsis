// Turn raw Mongoose/Mongo errors into plain, user-facing messages.
// Never leaks Mongoose wording such as "is not a valid enum value" or
// "Path `x` ..." — or raw driver/CastError text — into API responses.
// Unknown (non-validation) errors get a generic message ONLY; callers
// must return 500 for those (see errorStatus / handleRouteError), never
// 400 with a raw message.
const FIELD_LABELS = {
  designation: 'Designation',
  facultyId: 'Faculty ID',
  department: 'Department',
  name: 'Name',
  email: 'Email',
  password: 'Password',
  qualification: 'Qualification',
  phone: 'Phone',
  subjects: 'Subjects',
  type: 'Leave type',
  status: 'Status',
  day: 'Day',
  subject: 'Subject',
  faculty: 'Faculty',
  classroom: 'Classroom',
  startTime: 'Start time',
  endTime: 'End time',
  semester: 'Semester',
  section: 'Section',
};

function label(field) {
  return FIELD_LABELS[field] || field.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}

export function isCastError(err) {
  return Boolean(err && err.name === 'CastError');
}

export function isValidationLike(err) {
  return Boolean(
    err &&
      (err.name === 'ValidationError' || err.name === 'CastError' || err.code === 11000)
  );
}

/** HTTP status for a caught error: 400 for validation-like errors, 500 otherwise. */
export function errorStatus(err) {
  return isValidationLike(err) ? 400 : 500;
}

export function friendlyValidationMessage(err) {
  if (!err) return 'Something went wrong. Please check your input and try again.';
  if (err.code === 11000) return 'A record with this value already exists. Please use a different value.';
  if (err.name === 'CastError') return 'Invalid ID provided. Please check the ID and try again.';
  if (err.name === 'ValidationError' && err.errors) {
    const parts = Object.values(err.errors).map((e) => {
      const field = e.path || 'field';
      const name = label(field);
      if (e.kind === 'enum' && e.properties && Array.isArray(e.properties.enumValues)) {
        return `${name} must be one of: ${e.properties.enumValues.join(', ')}.`;
      }
      if (e.kind === 'required') return `${name} is required.`;
      if (e.kind === 'min' || e.kind === 'max') return `${name} is out of range.`;
      if (e.kind === 'regexp' || e.kind === 'match') return `${name} is not in a valid format.`;
      return `Please check ${name}.`;
    });
    return parts.join(' ');
  }
  if (err.name === 'ValidationError') return 'Please check your input and try again.';
  // Generic fallback for unknown errors: never return raw driver text.
  return 'Something went wrong. Please try again.';
}

/**
 * Send a route error response through the standard mapping:
 * validation-like errors -> 400 with a friendly message, everything
 * else -> 500 with a generic message. Returns true (always sends).
 * Pass `duplicateMessage` to keep a safe, specific duplicate message.
 */
export function handleRouteError(res, err, duplicateMessage) {
  if (err && err.code === 11000 && duplicateMessage) {
    return res.status(400).json({ message: duplicateMessage });
  }
  return res.status(errorStatus(err)).json({ message: friendlyValidationMessage(err) });
}

/** Normalise a classroom for comparison/storage: trim + uppercase. */
export function normalizeClassroom(value) {
  return String(value ?? '').trim().toUpperCase();
}

/** Normalise a faculty reference (ObjectId, populated object, or string) to a string id. */
export function normalizeFacultyId(value) {
  if (value == null) return '';
  if (typeof value === 'object') return String(value._id ?? value);
  return String(value);
}

export default friendlyValidationMessage;
