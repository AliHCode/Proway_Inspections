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
};

export const USER_ROLES = {
  CONTRACTOR: 'contractor',
  CONSULTANT: 'consultant',
  ADMIN: 'admin',
};

export const STATUS_COLORS = {
  pending: { bg: '#fef3c7', text: '#92400e', border: '#fbbf24' },
  approved: { bg: '#d1fae5', text: '#065f46', border: '#34d399' },
  rejected: { bg: '#fee2e2', text: '#991b1b', border: '#f87171' },
  info_requested: { bg: '#e0e7ff', text: '#3730a3', border: '#818cf8' },
};
