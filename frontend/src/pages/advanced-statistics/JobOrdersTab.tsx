import React from 'react';

const JobOrdersTab: React.FC = () => {
  // This is a placeholder. The new job-order level analytics implementation can be added here.
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-gray-800">Job Orders</h2>
      <p className="text-gray-600">
        This tab will show job-order level statistics and distributions (completion, issues, second
        degree, and other KPIs).
      </p>
    </div>
  );
};

export default JobOrdersTab;

