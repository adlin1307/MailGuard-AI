import { api, getStoredAuthToken } from './api';

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
  lastLogin?: string;
}

interface StoredUserAccount {
  id: string;
  name: string;
  email: string;
  salt: string;
  passwordHash: string;
  role: string;
  createdAt: string;
  lastLogin?: string;
}

export interface PasswordValidationResult {
  hasMinLength: boolean;
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasNumber: boolean;
  hasSpecialChar: boolean;
  isValid: boolean;
  strengthScore: number; // 0-100
  strengthLabel: 'Very Weak' | 'Weak' | 'Medium' | 'Strong' | 'Very Strong';
  strengthColor: string;
}

const USERS_STORAGE_KEY = 'probmail_registered_users_v1';
const SESSION_STORAGE_KEY = 'probmail_active_session_v1';

// Web Crypto SHA-256 helper
async function hashPasswordWithSalt(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${salt}:${password}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function generateRandomSalt(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function validatePassword(password: string): PasswordValidationResult {
  const hasMinLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecialChar = /[^A-Za-z0-9]/.test(password);

  let criteriaCount = 0;
  if (hasMinLength) criteriaCount++;
  if (hasUppercase) criteriaCount++;
  if (hasLowercase) criteriaCount++;
  if (hasNumber) criteriaCount++;
  if (hasSpecialChar) criteriaCount++;

  const isValid = hasMinLength && hasUppercase && hasLowercase && hasNumber;

  let strengthScore = 0;
  let strengthLabel: PasswordValidationResult['strengthLabel'] = 'Very Weak';
  let strengthColor = '#ef4444'; // rose

  if (password.length === 0) {
    strengthScore = 0;
    strengthLabel = 'Very Weak';
    strengthColor = '#64748b';
  } else if (criteriaCount <= 2 || password.length < 6) {
    strengthScore = 25;
    strengthLabel = 'Weak';
    strengthColor = '#f43f5e';
  } else if (criteriaCount === 3 || password.length < 8) {
    strengthScore = 50;
    strengthLabel = 'Medium';
    strengthColor = '#f59e0b';
  } else if (criteriaCount === 4 && password.length >= 8) {
    strengthScore = 75;
    strengthLabel = 'Strong';
    strengthColor = '#06b6d4';
  } else if (criteriaCount === 5 && password.length >= 10) {
    strengthScore = 100;
    strengthLabel = 'Very Strong';
    strengthColor = '#10b981';
  } else {
    strengthScore = 65;
    strengthLabel = 'Medium';
    strengthColor = '#f59e0b';
  }

  return {
    hasMinLength,
    hasUppercase,
    hasLowercase,
    hasNumber,
    hasSpecialChar,
    isValid,
    strengthScore,
    strengthLabel,
    strengthColor,
  };
}

export function validateEmail(email: string): boolean {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email.trim());
}

class AuthService {
  private getStoredUsers(): StoredUserAccount[] {
    try {
      const data = localStorage.getItem(USERS_STORAGE_KEY);
      if (!data) return [];
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  private saveStoredUsers(users: StoredUserAccount[]): void {
    try {
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
    } catch (e) {
      console.error('Failed to save users in localStorage', e);
    }
  }

  private cacheUserAccount(account: StoredUserAccount): void {
    const users = this.getStoredUsers();
    const idx = users.findIndex((u) => u.email.toLowerCase() === account.email.toLowerCase());
    if (idx >= 0) {
      users[idx] = { ...users[idx], ...account };
    } else {
      users.push(account);
    }
    this.saveStoredUsers(users);
  }

  public getRegisteredUserCount(): number {
    return this.getStoredUsers().length;
  }

  public getAllRegisteredUsers(): { id: string; name: string; email: string; role: string }[] {
    // Return cached users immediately
    return this.getStoredUsers().map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
    }));
  }

  public async syncUsersFromBackend(): Promise<void> {
    try {
      const res = await api.getRegisteredUsers();
      if (res && Array.isArray(res.users)) {
        const localUsers = this.getStoredUsers();
        for (const remoteUser of res.users) {
          const exists = localUsers.find((u) => u.email.toLowerCase() === remoteUser.email.toLowerCase());
          if (!exists) {
            localUsers.push({
              id: remoteUser.id,
              name: remoteUser.name,
              email: remoteUser.email.toLowerCase(),
              salt: '',
              passwordHash: '',
              role: remoteUser.role || 'SecOps Analyst',
              createdAt: remoteUser.created_at || new Date().toISOString(),
            });
          }
        }
        this.saveStoredUsers(localUsers);
      }
    } catch {
      // Ignore background sync errors
    }
  }

  public checkEmailExists(email: string): boolean {
    const trimmed = email.trim().toLowerCase();
    const users = this.getStoredUsers();
    return users.some((u) => u.email.toLowerCase() === trimmed);
  }

  public async signUp(params: {
    name: string;
    email: string;
    password: string;
    confirmPassword: string;
    role?: string;
  }): Promise<User> {
    const { name, email, password, confirmPassword } = params;

    // 1. Validation
    if (!name || name.trim().length < 2) {
      throw new Error('Please enter your full name (minimum 2 characters).');
    }

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      throw new Error('Email address is required.');
    }

    if (!validateEmail(trimmedEmail)) {
      throw new Error('Please enter a valid email address (e.g., analyst@security.org).');
    }

    const passwordVal = validatePassword(password);
    if (!passwordVal.hasMinLength) {
      throw new Error('Password must be at least 8 characters long.');
    }
    if (!passwordVal.hasUppercase) {
      throw new Error('Password must contain at least one uppercase letter (A-Z).');
    }
    if (!passwordVal.hasLowercase) {
      throw new Error('Password must contain at least one lowercase letter (a-z).');
    }
    if (!passwordVal.hasNumber) {
      throw new Error('Password must contain at least one numeric digit (0-9).');
    }

    if (password !== confirmPassword) {
      throw new Error('Passwords do not match. Please verify both password fields.');
    }

    // 2. Cryptographic Salt & Hash
    const salt = generateRandomSalt();
    const passwordHash = await hashPasswordWithSalt(password, salt);
    const userId = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const role = params.role || 'SecOps Analyst';
    const now = new Date().toISOString();

    // 3. Register user with backend SQLite database
    try {
      const res = await api.registerUser({
        user_id: userId,
        name: name.trim(),
        email: trimmedEmail,
        password,
        password_hash: passwordHash,
        salt,
        role,
      });

      const registeredUser: User = {
        id: res.user?.user_id || res.user?.id || userId,
        name: res.user?.name || name.trim(),
        email: res.user?.email || trimmedEmail,
        role: res.user?.role || role,
        createdAt: res.user?.created_at || now,
        lastLogin: now,
      };

      const accountRecord: StoredUserAccount = {
        id: registeredUser.id,
        name: registeredUser.name,
        email: registeredUser.email,
        salt,
        passwordHash,
        role: registeredUser.role,
        createdAt: registeredUser.createdAt,
        lastLogin: now,
      };
      this.cacheUserAccount(accountRecord);
      this.setSession(registeredUser);
      return registeredUser;
    } catch (err: any) {
      const msg = err?.message || '';
      if (msg.includes('already registered')) {
        throw new Error('An account with this email address is already registered. Please go to Login.');
      }
      // If backend network call failed completely, fallback to storing locally
      const localAccount: StoredUserAccount = {
        id: userId,
        name: name.trim(),
        email: trimmedEmail,
        salt,
        passwordHash,
        role,
        createdAt: now,
        lastLogin: now,
      };
      this.cacheUserAccount(localAccount);
      const publicUser: User = {
        id: userId,
        name: name.trim(),
        email: trimmedEmail,
        role,
        createdAt: now,
        lastLogin: now,
      };
      this.setSession(publicUser);
      return publicUser;
    }
  }

  public async login(params: {
    email: string;
    password: string;
  }): Promise<User> {
    const { email, password } = params;

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      throw new Error('Please enter your registered email address.');
    }

    if (!validateEmail(trimmedEmail)) {
      throw new Error('Please enter a valid email address.');
    }

    if (!password) {
      throw new Error('Please enter your password.');
    }

    // 1. Attempt authentication with backend SQLite database
    try {
      const res = await api.loginUser({
        email: trimmedEmail,
        password,
      });

      if (res && res.user) {
        const publicUser: User = {
          id: res.user.user_id || res.user.id,
          name: res.user.name,
          email: res.user.email,
          role: res.user.role || 'SecOps Analyst',
          createdAt: res.user.created_at || new Date().toISOString(),
          lastLogin: new Date().toISOString(),
        };

        // Cache in local storage for session consistency
        const localUsers = this.getStoredUsers();
        const existingLocal = localUsers.find((u) => u.email.toLowerCase() === trimmedEmail);
        if (existingLocal) {
          existingLocal.lastLogin = publicUser.lastLogin;
          this.saveStoredUsers(localUsers);
        } else {
          this.cacheUserAccount({
            id: publicUser.id,
            name: publicUser.name,
            email: publicUser.email,
            salt: '',
            passwordHash: '',
            role: publicUser.role,
            createdAt: publicUser.createdAt,
            lastLogin: publicUser.lastLogin,
          });
        }

        this.setSession(publicUser);
        return publicUser;
      }
      throw new Error('Login failed: unexpected backend response.');
    } catch (err: any) {
      const errorMsg = err?.message || '';

      // Check for account not found (404)
      if (
        errorMsg.includes('No registered account') ||
        errorMsg.includes('not found') ||
        errorMsg.includes('sign up first')
      ) {
        // Fallback: check if the account exists in localStorage (e.g. from earlier local-only signup)
        const localUsers = this.getStoredUsers();
        const localAccount = localUsers.find((u) => u.email.toLowerCase() === trimmedEmail);
        if (localAccount && localAccount.salt && localAccount.passwordHash) {
          // Verify password locally
          const computedHash = await hashPasswordWithSalt(password, localAccount.salt);
          if (computedHash === localAccount.passwordHash) {
            // Auto-migrate account to backend SQLite database
            try {
              const regRes = await api.registerUser({
                user_id: localAccount.id,
                name: localAccount.name,
                email: localAccount.email,
                password_hash: localAccount.passwordHash,
                salt: localAccount.salt,
                role: localAccount.role,
              });
              if (regRes && regRes.user) {
                const migratedUser: User = {
                  id: regRes.user.user_id || regRes.user.id,
                  name: regRes.user.name,
                  email: regRes.user.email,
                  role: regRes.user.role || localAccount.role,
                  createdAt: localAccount.createdAt,
                  lastLogin: new Date().toISOString(),
                };
                this.setSession(migratedUser);
                return migratedUser;
              }
            } catch {
              // If backend registration failed, still allow valid local account
            }
            const publicUser: User = {
              id: localAccount.id,
              name: localAccount.name,
              email: localAccount.email,
              role: localAccount.role,
              createdAt: localAccount.createdAt,
              lastLogin: new Date().toISOString(),
            };
            this.setSession(publicUser);
            return publicUser;
          } else {
            throw new Error('Incorrect password. Please verify your credentials and try again.');
          }
        }
        throw new Error(
          'No registered account found with this email. You must sign up first before logging in.'
        );
      }

      // Check for incorrect credentials (401)
      if (errorMsg.includes('Incorrect password') || errorMsg.includes('Authentication failed')) {
        throw new Error('Incorrect password. Please verify your credentials and try again.');
      }

      // If backend network error (e.g. backend server not running):
      const localUsers = this.getStoredUsers();
      const localAccount = localUsers.find((u) => u.email.toLowerCase() === trimmedEmail);
      if (localAccount && localAccount.salt && localAccount.passwordHash) {
        const computedHash = await hashPasswordWithSalt(password, localAccount.salt);
        if (computedHash !== localAccount.passwordHash) {
          throw new Error('Incorrect password. Please verify your credentials and try again.');
        }
        const publicUser: User = {
          id: localAccount.id,
          name: localAccount.name,
          email: localAccount.email,
          role: localAccount.role,
          createdAt: localAccount.createdAt,
          lastLogin: new Date().toISOString(),
        };
        this.setSession(publicUser);
        return publicUser;
      }

      if (!localAccount && (errorMsg.includes('Failed to fetch') || errorMsg.includes('NetworkError'))) {
        throw new Error(
          'No registered account found with this email. You must sign up first before logging in.'
        );
      }

      throw new Error(errorMsg || 'Login failed. Please try again.');
    }
  }

  public logout(): void {
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      api.clearAuthSession();
    } catch (e) {
      console.error('Failed to clear session', e);
    }
  }

  public getCurrentUser(): User | null {
    try {
      const session = localStorage.getItem(SESSION_STORAGE_KEY);
      if (!session) return null;
      const user: User = JSON.parse(session);
      // Ensure backend session token is synchronized if missing
      if (!getStoredAuthToken() && user.id && user.email) {
        const account = this.getStoredUsers().find((u) => u.email.toLowerCase() === user.email.toLowerCase());
        api.createAuthSession(user.id, user.email, account ? {
          passwordHash: account.passwordHash,
          salt: account.salt,
          name: account.name,
          role: account.role,
        } : undefined).catch(() => {});
      }
      return user;
    } catch {
      return null;
    }
  }

  private setSession(user: User): void {
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user));
      const account = this.getStoredUsers().find((u) => u.email.toLowerCase() === user.email.toLowerCase());
      api.createAuthSession(user.id, user.email, account ? {
        passwordHash: account.passwordHash,
        salt: account.salt,
        name: account.name,
        role: account.role,
      } : undefined).catch((err) => {
        console.warn('Note: Backend auth session token sync:', err?.message);
      });
    } catch (e) {
      console.error('Failed to set session', e);
    }
  }
}

export const authService = new AuthService();
