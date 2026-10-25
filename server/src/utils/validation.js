// Turn raw Mongoose errors into plain, user-facing messages.
// Never leaks Mongoose wording such as "is not a valid enum value" or
// "Path `x` ..." into API responses / the UI.
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

export function friendlyValidationMessage(err) {
  if (!err) return 'Something went wrong. Please check your input and try again.';
  if (err.code === 11000) return 'A record with this value already exists. Please use a different value.';
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
  // Fallback: strip any residual Mongoose phrasing from other errors.
  const msg = String(err.message || err);
  if (/valid enum value|Validation failed|Path `/i.test(msg)) {
    return 'Please check your input and try again.';
  }
  return msg;
}

export default friendlyValidationMessage;
