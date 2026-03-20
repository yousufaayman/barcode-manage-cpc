import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import Layout from '../components/Layout';
import { authApi, type User } from '../services/api';
import { Eye, EyeOff } from 'lucide-react';

const UserManagementPage: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [newUser, setNewUser] = useState({
    username: '',
    password: '',
    role: 'cutting'
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  
  // Reset password modal state
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Edit user modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({ username: '', role: 'cutting' as User['role'] });
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  
  const { user } = useAuth();
  const { t } = useTranslation();

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setListLoading(true);
    setError('');
    try {
      const data = await authApi.getAllUsers();
      setUsers(data);
    } catch (err: any) {
      const msg = err.response?.data?.detail ?? (Array.isArray(err.response?.data?.detail) ? err.response?.data?.detail[0]?.msg : 'Failed to load users');
      setError(typeof msg === 'string' ? msg : 'Failed to load users');
      setUsers([]);
    } finally {
      setListLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      await authApi.createUser(newUser);
      setSuccess('User created successfully!');
      setNewUser({
        username: '',
        password: '',
        role: 'cutting'
      });
      await fetchUsers();
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      const msg = Array.isArray(detail) ? detail[0]?.msg : detail;
      setError(typeof msg === 'string' ? msg : 'Failed to create user');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteUser = async (userId: number) => {
    if (!globalThis.confirm('Are you sure you want to delete this user?')) {
      return;
    }
    setError('');
    setSuccess('');
    try {
      await authApi.deleteUser(userId);
      setSuccess('User deleted successfully!');
      await fetchUsers();
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Failed to delete user');
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !newPassword.trim()) return;

    setIsResetting(true);
    setError('');
    setSuccess('');

    try {
      await authApi.resetPassword(selectedUser.id, newPassword);
      setSuccess('Password reset successfully!');
      setResetModalOpen(false);
      setSelectedUser(null);
      setNewPassword('');
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Failed to reset password');
    } finally {
      setIsResetting(false);
    }
  };

  const openEditModal = (u: User) => {
    setEditUser(u);
    const role: User['role'] = (u.role === 'admin' || u.role === 'general_operations' || u.role === 'cutting' || u.role === 'sewing' || u.role === 'packaging') ? u.role : 'cutting';
    setEditForm({ username: u.username, role });
    setError('');
    setSuccess('');
    setEditModalOpen(true);
  };

  const closeEditModal = () => {
    setEditModalOpen(false);
    setEditUser(null);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUser) return;
    setIsSavingEdit(true);
    setError('');
    setSuccess('');
    try {
      await authApi.updateUserById(editUser.id, {
        username: editForm.username,
        role: editForm.role
      });
      setSuccess('User updated successfully!');
      closeEditModal();
      await fetchUsers();
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Failed to update user');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const openResetModal = (user: User) => {
    setSelectedUser(user);
    setNewPassword('');
    setError('');
    setSuccess('');
    setResetModalOpen(true);
  };

  const closeResetModal = () => {
    setResetModalOpen(false);
    setSelectedUser(null);
    setNewPassword('');
    setError('');
  };

  if (user?.role !== 'admin') {
    return (
      <Layout>
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Access Denied</h1>
          <p className="text-gray-600">You need admin privileges to access this page.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2 text-gray-800">{t('userManagement.title')}</h1>
        <p className="text-gray-600">{t('userManagement.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Create User Form */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-semibold mb-4">{t('userManagement.createNewUser')}</h2>
            
            {error && (
              <div className="mb-4 p-3 bg-red-50 border-l-4 border-red-400 text-red-700">
                <p>{error}</p>
              </div>
            )}
            
            {success && (
              <div className="mb-4 p-3 bg-green-50 border-l-4 border-green-400 text-green-700">
                <p>{success}</p>
              </div>
            )}
            
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                  {t('userManagement.username')}
                </label>
                <input
                  type="text"
                  id="username"
                  value={newUser.username}
                  onChange={(e) => setNewUser({...newUser, username: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green focus:border-transparent"
                  required
                />
              </div>
              
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  {t('auth.password')}
                </label>
                <div className="relative">
                  <input
                    type={showCreatePassword ? "text" : "password"}
                    id="password"
                    value={newUser.password}
                    onChange={(e) => setNewUser({...newUser, password: e.target.value})}
                    className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green focus:border-transparent"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowCreatePassword(!showCreatePassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                    tabIndex={-1}
                  >
                    {showCreatePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              
              <div>
                <label htmlFor="role" className="block text-sm font-medium text-gray-700 mb-1">
                  {t('userManagement.role')}
                </label>
                <select
                  id="role"
                  value={newUser.role}
                  onChange={(e) => setNewUser({...newUser, role: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green focus:border-transparent"
                >
                  <option value="admin">{t('userManagement.admin')}</option>
                  <option value="general_operations">{t('userManagement.general_operations')}</option>
                  <option value="cutting">{t('userManagement.cutting')}</option>
                  <option value="sewing">{t('userManagement.sewing')}</option>
                  <option value="packaging">{t('userManagement.packaging')}</option>
                </select>
              </div>
              
              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-green text-white py-2 px-4 rounded-md hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? t('common.loading') : t('userManagement.createUser')}
              </button>
            </form>

            <div className="mt-6">
              <h3 className="text-sm font-semibold mb-2">{t('userManagement.rolePermissions')}</h3>
              <ul className="text-sm text-gray-600 space-y-2">
                <li className="flex items-start">
                  <span className="font-medium mr-1">{t('userManagement.admin')}:</span> {t('userManagement.adminPermissions')}
                </li>
                <li className="flex items-start">
                  <span className="font-medium mr-1">{t('userManagement.general_operations')}:</span> {t('userManagement.generalOperationsPermissions')}
                </li>
                <li className="flex items-start">
                  <span className="font-medium mr-1">{t('userManagement.cutting')}:</span> {t('userManagement.cuttingPermissions')}
                </li>
                <li className="flex items-start">
                  <span className="font-medium mr-1">{t('userManagement.sewing')}:</span> {t('userManagement.sewingPermissions')}
                </li>
                <li className="flex items-start">
                  <span className="font-medium mr-1">{t('userManagement.packaging')}:</span> {t('userManagement.packagingPermissions')}
                </li>
              </ul>
            </div>
          </div>
        </div>
        
        {/* User List */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-semibold mb-4">{t('userManagement.userList', 'User List')}</h2>
            <div className="overflow-x-auto">
              {listLoading ? (
                <div className="py-8 text-center text-gray-500">{t('common.loading')}</div>
              ) : (
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {t('userManagement.username')}
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {t('userManagement.role')}
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-48">
                        {t('common.actions')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {u.username}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                            {u.role}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm font-medium">
                          <div className="flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-3 flex-wrap">
                            <button
                              type="button"
                              onClick={() => openEditModal(u)}
                              className="text-indigo-600 hover:text-indigo-900 whitespace-nowrap text-left"
                            >
                              {t('common.edit', 'Edit')}
                            </button>
                            <button
                              type="button"
                              onClick={() => openResetModal(u)}
                              className="text-blue-600 hover:text-blue-900 whitespace-nowrap text-left"
                            >
                              {t('userManagement.resetPassword')}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteUser(u.id)}
                              className="text-red-600 hover:text-red-900 whitespace-nowrap text-left"
                            >
                              {t('common.delete')}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Edit User Modal */}
      {editModalOpen && editUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">
                {t('common.edit', 'Edit')} {editUser.username}
              </h3>
              <button
                type="button"
                onClick={closeEditModal}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border-l-4 border-red-400 text-red-700">
                <p>{error}</p>
              </div>
            )}

            {success && (
              <div className="mb-4 p-3 bg-green-50 border-l-4 border-green-400 text-green-700">
                <p>{success}</p>
              </div>
            )}

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label htmlFor="edit-username" className="block text-sm font-medium text-gray-700 mb-1">
                  {t('userManagement.username')}
                </label>
                <input
                  type="text"
                  id="edit-username"
                  value={editForm.username}
                  onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label htmlFor="edit-role" className="block text-sm font-medium text-gray-700 mb-1">
                  {t('userManagement.role')}
                </label>
                <select
                  id="edit-role"
                  value={editForm.role}
                  onChange={(e) => setEditForm({ ...editForm, role: e.target.value as User['role'] })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green focus:border-transparent"
                >
                  <option value="admin">{t('userManagement.admin')}</option>
                  <option value="general_operations">{t('userManagement.general_operations')}</option>
                  <option value="cutting">{t('userManagement.cutting')}</option>
                  <option value="sewing">{t('userManagement.sewing')}</option>
                  <option value="packaging">{t('userManagement.packaging')}</option>
                </select>
              </div>
              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={closeEditModal}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="flex-1 bg-green text-white py-2 px-4 rounded-md hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSavingEdit ? t('common.loading') : t('common.save', 'Save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetModalOpen && selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">
                {t('userManagement.resetPasswordFor')} {selectedUser.username}
              </h3>
              <button
                onClick={closeResetModal}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border-l-4 border-red-400 text-red-700">
                <p>{error}</p>
              </div>
            )}

            {success && (
              <div className="mb-4 p-3 bg-green-50 border-l-4 border-green-400 text-green-700">
                <p>{success}</p>
              </div>
            )}

            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-1">
                  {t('userManagement.newPassword')}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    id="newPassword"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green focus:border-transparent"
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={closeResetModal}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isResetting || !newPassword.trim()}
                  className="flex-1 bg-green text-white py-2 px-4 rounded-md hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {isResetting ? t('common.loading') : t('userManagement.resetPassword')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default UserManagementPage;
