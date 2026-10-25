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

  public getRegisteredUserCount(): number {
    return this.getStoredUsers().length;
  }

  public getAllRegisteredUsers(): { id: string; name: string; email: string; role: string }[] {
    return this.getStoredUsers().map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
    }));
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

    if (this.checkEmailExists(trimmedEmail)) {
      throw new Error(
        'An account with this email address is already registered. Please go to Login.'
      );
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

    const now = new Date().toISOString();
    const newUserAccount: StoredUserAccount = {
      id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: name.trim(),
      email: trimmedEmail,
      salt,
      passwordHash,
      role: params.role || 'SecOps Analyst',
      createdAt: now,
      lastLogin: now,
    };

    const users = this.getStoredUsers();
    users.push(newUserAccount);
    this.saveStoredUsers(users);

    const publicUser: User = {
      id: newUserAccount.id,
      name: newUserAccount.name,
      email: newUserAccount.email,
      role: newUserAccount.role,
      createdAt: newUserAccount.createdAt,
      lastLogin: newUserAccount.lastLogin,
    };

    // Auto-login session on successful signup
    this.setSession(publicUser);
    return publicUser;
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

    const users = this.getStoredUsers();
    const account = users.find((u) => u.email.toLowerCase() === trimmedEmail);

    // Explicit requirement: "ONCE SIGNUP ONLY WE SHOULD BE ABLE TO LOGIN"
    if (!account) {
      throw new Error(
        'No registered account found with this email. You must sign up first before logging in.'
      );
    }

    // Verify Password Hash
    const computedHash = await hashPasswordWithSalt(password, account.salt);
    if (computedHash !== account.passwordHash) {
      throw new Error('Incorrect password. Please verify your credentials and try again.');
    }

    // Update last login
    account.lastLogin = new Date().toISOString();
    this.saveStoredUsers(users);

    const publicUser: User = {
      id: account.id,
      name: account.name,
      email: account.email,
      role: account.role,
      createdAt: account.createdAt,
      lastLogin: account.lastLogin,
    };

    this.setSession(publicUser);
    return publicUser;
  }

  public logout(): void {
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch (e) {
      console.error('Failed to clear session', e);
    }
  }

  public getCurrentUser(): User | null {
    try {
      const session = localStorage.getItem(SESSION_STORAGE_KEY);
      if (!session) return null;
      return JSON.parse(session);
    } catch {
      return null;
    }
  }

  private setSession(user: User): void {
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user));
    } catch (e) {
      console.error('Failed to set session', e);
    }
  }
}

export const authService = new AuthService();
