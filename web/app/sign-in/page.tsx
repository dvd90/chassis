import { SignInPanel } from '@/auth/active';

export const metadata = { title: 'Sign in · Chassis' };

export default function SignInPage() {
  return (
    <div className="center-stage rise">
      <SignInPanel />
    </div>
  );
}
