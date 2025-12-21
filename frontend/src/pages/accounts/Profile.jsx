import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './Profile.css';

const Profile = () => {
  const navigate = useNavigate();
  const [profileData, setProfileData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phoneNumber: '',
    profilePicture: '',
  });
  
  const [securitySettings, setSecuritySettings] = useState({
    pinEnabled: false,
    biometricEnabled: false,
    pinSetup: false,
    biometricSetup: false,
  });

  const [isEditing, setIsEditing] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [showPINModal, setShowPINModal] = useState(false);
  const [showBiometricModal, setShowBiometricModal] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pinError, setPinError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    fetchProfileData();
    fetchSecuritySettings();
  }, []);

  const fetchProfileData = async () => {
    try {
      const response = await axios.get('/api/accounts/profile', {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });
      setProfileData(response.data);
    } catch (error) {
      console.error('Error fetching profile data:', error);
      setErrorMessage('Failed to load profile data');
    }
  };

  const fetchSecuritySettings = async () => {
    try {
      const response = await axios.get('/api/accounts/security-settings', {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });
      setSecuritySettings(response.data);
    } catch (error) {
      console.error('Error fetching security settings:', error);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setProfileData({
      ...profileData,
      [name]: value,
    });
  };

  const handleSaveProfile = async () => {
    setIsSavingProfile(true);
    try {
      const response = await axios.put('/api/accounts/profile', profileData, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });
      setProfileData(response.data);
      setIsEditing(false);
      setSuccessMessage('Profile updated successfully!');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      console.error('Error saving profile:', error);
      setErrorMessage('Failed to save profile');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handlePINSetup = async () => {
    if (!pinInput || !pinConfirm) {
      setPinError('Both PIN fields are required');
      return;
    }

    if (pinInput !== pinConfirm) {
      setPinError('PINs do not match');
      return;
    }

    if (pinInput.length < 4 || pinInput.length > 6) {
      setPinError('PIN must be between 4 and 6 digits');
      return;
    }

    if (!/^\d+$/.test(pinInput)) {
      setPinError('PIN must contain only numbers');
      return;
    }

    try {
      await axios.post(
        '/api/accounts/security-settings/setup-pin',
        { pin: pinInput },
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        }
      );

      setSecuritySettings({
        ...securitySettings,
        pinEnabled: true,
        pinSetup: true,
      });

      setPinInput('');
      setPinConfirm('');
      setPinError('');
      setShowPINModal(false);
      setSuccessMessage('PIN setup successfully!');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      console.error('Error setting up PIN:', error);
      setPinError(error.response?.data?.message || 'Failed to setup PIN');
    }
  };

  const handleBiometricToggle = async () => {
    try {
      const endpoint = securitySettings.biometricEnabled
        ? '/api/accounts/security-settings/disable-biometric'
        : '/api/accounts/security-settings/enable-biometric';

      await axios.post(
        endpoint,
        {},
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        }
      );

      setSecuritySettings({
        ...securitySettings,
        biometricEnabled: !securitySettings.biometricEnabled,
      });

      const action = securitySettings.biometricEnabled ? 'disabled' : 'enabled';
      setSuccessMessage(`Biometric authentication ${action} successfully!`);
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      console.error('Error toggling biometric:', error);
      setErrorMessage('Failed to update biometric settings');
    }
  };

  const handleDisablePIN = async () => {
    try {
      await axios.post(
        '/api/accounts/security-settings/disable-pin',
        {},
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        }
      );

      setSecuritySettings({
        ...securitySettings,
        pinEnabled: false,
      });

      setSuccessMessage('PIN disabled successfully!');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      console.error('Error disabling PIN:', error);
      setErrorMessage('Failed to disable PIN');
    }
  };

  return (
    <div className="profile-container">
      <div className="profile-header">
        <h1>My Account</h1>
      </div>

      {successMessage && (
        <div className="alert alert-success">
          {successMessage}
        </div>
      )}

      {errorMessage && (
        <div className="alert alert-error">
          {errorMessage}
        </div>
      )}

      {/* Profile Information Section */}
      <div className="profile-section">
        <h2>Profile Information</h2>
        
        {isEditing ? (
          <div className="profile-form">
            <div className="form-group">
              <label htmlFor="firstName">First Name</label>
              <input
                type="text"
                id="firstName"
                name="firstName"
                value={profileData.firstName}
                onChange={handleInputChange}
              />
            </div>

            <div className="form-group">
              <label htmlFor="lastName">Last Name</label>
              <input
                type="text"
                id="lastName"
                name="lastName"
                value={profileData.lastName}
                onChange={handleInputChange}
              />
            </div>

            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                type="email"
                id="email"
                name="email"
                value={profileData.email}
                onChange={handleInputChange}
              />
            </div>

            <div className="form-group">
              <label htmlFor="phoneNumber">Phone Number</label>
              <input
                type="tel"
                id="phoneNumber"
                name="phoneNumber"
                value={profileData.phoneNumber}
                onChange={handleInputChange}
              />
            </div>

            <div className="form-actions">
              <button
                className="btn btn-primary"
                onClick={handleSaveProfile}
                disabled={isSavingProfile}
              >
                {isSavingProfile ? 'Saving...' : 'Save'}
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setIsEditing(false);
                  fetchProfileData();
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="profile-view">
            <div className="profile-item">
              <span className="label">First Name:</span>
              <span className="value">{profileData.firstName}</span>
            </div>
            <div className="profile-item">
              <span className="label">Last Name:</span>
              <span className="value">{profileData.lastName}</span>
            </div>
            <div className="profile-item">
              <span className="label">Email:</span>
              <span className="value">{profileData.email}</span>
            </div>
            <div className="profile-item">
              <span className="label">Phone Number:</span>
              <span className="value">{profileData.phoneNumber}</span>
            </div>

            <button
              className="btn btn-primary"
              onClick={() => setIsEditing(true)}
            >
              Edit Profile
            </button>
          </div>
        )}
      </div>

      {/* Security Settings Section */}
      <div className="profile-section security-section">
        <h2>Security Settings</h2>

        {/* PIN Settings */}
        <div className="security-setting">
          <div className="setting-info">
            <h3>PIN Protection</h3>
            <p>Protect your account with a personal identification number</p>
            <p className="status">
              Status: {securitySettings.pinEnabled ? (
                <span className="status-enabled">Enabled</span>
              ) : (
                <span className="status-disabled">Disabled</span>
              )}
            </p>
          </div>

          <div className="setting-actions">
            {securitySettings.pinEnabled ? (
              <button
                className="btn btn-danger"
                onClick={handleDisablePIN}
              >
                Disable PIN
              </button>
            ) : (
              <button
                className="btn btn-primary"
                onClick={() => setShowPINModal(true)}
              >
                Setup PIN
              </button>
            )}
          </div>
        </div>

        {/* Biometric Settings */}
        <div className="security-setting">
          <div className="setting-info">
            <h3>Biometric Authentication</h3>
            <p>Use fingerprint or face recognition for quick access</p>
            <p className="status">
              Status: {securitySettings.biometricEnabled ? (
                <span className="status-enabled">Enabled</span>
              ) : (
                <span className="status-disabled">Disabled</span>
              )}
            </p>
          </div>

          <div className="setting-actions">
            <button
              className={`btn ${securitySettings.biometricEnabled ? 'btn-danger' : 'btn-primary'}`}
              onClick={handleBiometricToggle}
            >
              {securitySettings.biometricEnabled ? 'Disable' : 'Enable'} Biometric
            </button>
          </div>
        </div>
      </div>

      {/* PIN Setup Modal */}
      {showPINModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>Setup PIN</h2>
              <button
                className="close-btn"
                onClick={() => {
                  setShowPINModal(false);
                  setPinInput('');
                  setPinConfirm('');
                  setPinError('');
                }}
              >
                ×
              </button>
            </div>

            <div className="modal-body">
              {pinError && (
                <div className="alert alert-error">
                  {pinError}
                </div>
              )}

              <div className="form-group">
                <label htmlFor="pin">Enter PIN (4-6 digits)</label>
                <input
                  type="password"
                  id="pin"
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  placeholder="Enter your PIN"
                  maxLength="6"
                />
              </div>

              <div className="form-group">
                <label htmlFor="pinConfirm">Confirm PIN</label>
                <input
                  type="password"
                  id="pinConfirm"
                  value={pinConfirm}
                  onChange={(e) => setPinConfirm(e.target.value)}
                  placeholder="Confirm your PIN"
                  maxLength="6"
                />
              </div>

              <p className="pin-hint">
                Your PIN will be required for sensitive transactions and settings changes
              </p>
            </div>

            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setShowPINModal(false);
                  setPinInput('');
                  setPinConfirm('');
                  setPinError('');
                }}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handlePINSetup}
              >
                Setup PIN
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Profile;