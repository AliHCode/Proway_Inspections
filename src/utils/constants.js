export const INSPECTION_TYPES = [
  'Structural',
  'MEP',
  'Electrical',
  'Plumbing',
  'Finishing',
  'Landscaping',
  'Civil',
  'HVAC',
  'Fire Safety',
  'Other',
];

export const RFI_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  INFO_REQUESTED: 'info_requested',
  CONDITIONAL_APPROVE: 'conditional_approve',
  CANCELLED: 'cancelled',
};

export const USER_ROLES = {
  CONTRACTOR: 'contractor',
  CONSULTANT: 'consultant',
  ADMIN: 'admin',
  PENDING: 'pending',
  REJECTED: 'rejected',
};

export const STATUS_COLORS = {
  pending: { bg: '#fef3c7', text: '#92400e', border: '#fbbf24' },
  approved: { bg: '#d1fae5', text: '#065f46', border: '#34d399' },
  rejected: { bg: '#fee2e2', text: '#991b1b', border: '#f87171' },
  info_requested: { bg: '#e0e7ff', text: '#3730a3', border: '#818cf8' },
  conditional_approve: { bg: '#fffbeb', text: '#b45309', border: '#fcd34d' },
  cancelled: { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' },
};

export const COMMON_TIMEZONES = [
  { value: 'UTC', label: 'UTC (Universal)' },
  { value: 'Asia/Dubai', label: 'Asia/Dubai (GST)' },
  { value: 'Asia/Riyadh', label: 'Asia/Riyadh (AST)' },
  { value: 'Asia/Qatar', label: 'Asia/Qatar (AST)' },
  { value: 'Europe/London', label: 'Europe/London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Europe/Paris (CET)' },
  { value: 'America/New_York', label: 'America/New_York (EST/EDT)' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles (PST/PDT)' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore (SGT)' },
  { value: 'Asia/Hong_Kong', label: 'Asia/Hong_Kong (HKT)' },
  { value: 'Australia/Sydney', label: 'Australia/Sydney (AEST)' },
];
