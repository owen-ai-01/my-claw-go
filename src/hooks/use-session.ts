import { authClient } from '@/lib/auth-client';

export const useSession = () => {
  const { data: session, error } = authClient.useSession();
  // console.log('useCurrentUser, session:', session);
  if (error && Object.keys(error).length > 0) {
    console.error('useSession, error:', error);
    return null;
  }
  return session;
};
