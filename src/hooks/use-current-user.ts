import { authClient } from '@/lib/auth-client';

export const useCurrentUser = () => {
  const { data: session, error } = authClient.useSession();
  // console.log('useCurrentUser, session:', session);
  // if (error && Object.keys(error).length > 0) {
  //   console.error('useCurrentUser, error:', error);
  //   return null;
  // }
  return session?.user;
};
