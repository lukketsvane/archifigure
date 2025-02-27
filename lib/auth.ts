import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { createClient } from "@/lib/supabase";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    }),
  ],
  callbacks: {
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub as string;
      }
      return session;
    },
    async signIn({ user }) {
      if (user && user.email) {
        // Create user in Supabase if they don't exist
        const supabase = createClient();
        const { data, error } = await supabase
          .from('users')
          .upsert({
            id: user.id || user.email,
            email: user.email,
            name: user.name,
            image: user.image,
            updated_at: new Date().toISOString(),
          })
          .select('id')
          .single();
        
        if (error) {
          console.error('Error saving user to Supabase', error);
          return false;
        }
        
        return true;
      }
      return false;
    },
  },
  pages: {
    signIn: '/signin',
  },
  session: {
    strategy: 'jwt',
  },
  secret: process.env.NEXTAUTH_SECRET,
};