
import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { UserRole } from '../contexts/AuthContext';

interface User {
  id: number;
  username: string;
  role: UserRole;
  createdAt: string;
  lastActive: string;
  status: 'Active' | 'Inactive';
}

const UserManagementPage: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<UserRole>('Cutting');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  useEffect(() => {
    // Simulate API call to fetch users
    setLoading(true);
    
    setTimeout(() => {
      const mockUsers: User[] = [
        {
          id: 1,
          username: 'admin',
          role: 'Admin',
          createdAt: '2023-10-15',
          lastActive: '2023-11-02',
          status: 'Active'
        },
        {
          id: 2,
          username: 'cutting',
          role: 'Cutting',
          createdAt: '2023-10-20',
          lastActive: '2023-11-01',
          status: 'Active'
        },
        {
          id: 3,
          username: 'sewing',
          role: 'Sewing',
          createdAt: '2023-10-22',
          lastActive: '2023-10-31',
          status: 'Active'
        },
        {
          id: 4,
          username: 'packaging',
          role: 'Packaging',
          createdAt: '2023-10-25',
          lastActive: '2023-11-01',
          status: 'Active'
        },
      ];
      
      setUsers(mockUsers);
      setLoading(false);
    }, 800);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Reset messages
    setError('');
    setSuccess('');
    
    // Validate form
    if (!username.trim()) {
      setError('Username is required');
      return;
    }
    
    if (password.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }
    
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    
    // Check if username already exists
    if (users.some(user => user.username.toLowerCase() === username.toLowerCase())) {
      setError('Username already exists');
      return;
    }
    
    // Simulate API call to create user
    const newUser: User = {
      id: users.length + 1,
      username,
      role,
      createdAt: new Date().toISOString().split('T')[0],
      lastActive: new Date().toISOString().split('T')[0],
      status: 'Active'
    };
    
    setUsers([...users, newUser]);
    setSuccess(`User "${username}" created successfully`);
    
    // Reset form
    setUsername('');
    setPassword('');
    setConfirmPassword('');
    setRole('Cutting');
  };

  const handleDeactivate = (id: number) => {
    setUsers(users.map(user => 
      user.id === id 
        ? { ...user, status: user.status === 'Active' ? 'Inactive' : 'Active' } 
        : user
    ));
  };

  const handleDelete = (id: number) => {
    if (window.confirm('Are you sure you want to delete this user?')) {
      setUsers(users.filter(user => user.id !== id));
    }
  };

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2 text-gray-800">User Management</h1>
        <p className="text-gray-600">Create and manage system users</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Create User Form */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-semibold mb-4">Create New User</h2>
            
            {error && (
              <div className="mb-4 p-3 bg-red-50 border-l-4 border-red-400 text-red-700">
                <p>{error}</p>
              </div>
            )}
            
            {success && (
              <div className="mb-4 p-3 bg-green-50 border-l-4 border-green text-green">
                <p>{success}</p>
              </div>
            )}
            
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="username" className="text-gray-700 font-medium">
                  Username
                </label>
                <input
                  id="username"
                  type="text"
                  className="input-field"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter username"
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="password" className="text-gray-700 font-medium">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  className="input-field"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="confirmPassword" className="text-gray-700 font-medium">
                  Confirm Password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  className="input-field"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm password"
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="role" className="text-gray-700 font-medium">
                  Role
                </label>
                <select
                  id="role"
                  className="input-field"
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                >
                  <option value="Admin">Admin</option>
                  <option value="Cutting">Cutting</option>
                  <option value="Sewing">Sewing</option>
                  <option value="Packaging">Packaging</option>
                </select>
              </div>
              
              <button type="submit" className="btn-primary w-full mt-4">
                Create User
              </button>
            </form>
            
            <div className="mt-6">
              <h3 className="text-sm font-semibold mb-2">Role Permissions:</h3>
              <ul className="text-sm text-gray-600 space-y-2">
                <li className="flex items-start">
                  <span className="font-medium mr-1">Admin:</span> Full access to all features
                </li>
                <li className="flex items-start">
                  <span className="font-medium mr-1">Cutting:</span> Barcode scanning and management for cutting phase
                </li>
                <li className="flex items-start">
                  <span className="font-medium mr-1">Sewing:</span> Barcode scanning and management for sewing phase
                </li>
                <li className="flex items-start">
                  <span className="font-medium mr-1">Packaging:</span> Barcode scanning and management for packaging phase
                </li>
              </ul>
            </div>
          </div>
        </div>
        
        {/* User List */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-semibold mb-4">User List</h2>
            
            {loading ? (
              <div className="text-center py-10">
                <div className="w-12 h-12 border-4 border-green border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                <p className="text-gray-600">Loading users...</p>
              </div>
            ) : (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Username</th>
                      <th>Role</th>
                      <th>Created</th>
                      <th>Last Active</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(user => (
                      <tr key={user.id}>
                        <td>
                          <div className="font-medium">{user.username}</div>
                        </td>
                        <td>
                          <span className={`inline-block px-2 py-1 text-xs rounded-full
                            ${user.role === 'Admin' ? 'bg-purple-100 text-purple-800' :
                              user.role === 'Cutting' ? 'bg-blue-100 text-blue-800' :
                              user.role === 'Sewing' ? 'bg-green-100 text-green-800' :
                              'bg-orange-100 text-orange-800'
                            }`}
                          >
                            {user.role}
                          </span>
                        </td>
                        <td>{user.createdAt}</td>
                        <td>{user.lastActive}</td>
                        <td>
                          <span className={`inline-block px-2 py-1 text-xs rounded-full
                            ${user.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}
                          >
                            {user.status}
                          </span>
                        </td>
                        <td>
                          <div className="flex space-x-1">
                            <button
                              onClick={() => handleDeactivate(user.id)}
                              className={`p-1 text-xs rounded ${
                                user.status === 'Active' 
                                  ? 'bg-yellow-500 text-white' 
                                  : 'bg-green text-white'
                              }`}
                            >
                              {user.status === 'Active' ? 'Deactivate' : 'Activate'}
                            </button>
                            {user.username !== 'admin' && (
                              <button
                                onClick={() => handleDelete(user.id)}
                                className="p-1 text-xs bg-red-600 text-white rounded"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default UserManagementPage;
