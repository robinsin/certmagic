/**
 * @fileoverview API route to serve ACME HTTP-01 challenge responses.
 * Retrieves the expected key authorization from storage based on the token in the URL.
 * Serves the content as plain text, as required by the ACME protocol.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { retrieveHttpChallenge } from '@/lib/acme-storage'; // Use storage helper

interface RouteParams {
  params: {
    token: string;
  };
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { token } = params;

  if (!token || typeof token !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(token)) {
    console.warn(`ACME Challenge: Invalid or missing token received: ${token}`);
    return new NextResponse('Invalid token format', { status: 400 });
  }

  console.log(`ACME Challenge: Received request for token: ${token}`);

  try {
    // Retrieve the stored key authorization for this token
    const keyAuthorization = await retrieveHttpChallenge(token);

    if (!keyAuthorization) {
      console.warn(`ACME Challenge: No key authorization found for token: ${token}`);
      return new NextResponse('Challenge not found', { status: 404 });
    }

    console.log(`ACME Challenge: Found key authorization for token ${token}. Serving response.`);

    // Respond with the key authorization string as plain text
    // IMPORTANT: Let's Encrypt expects JUST the keyAuthorization, no extra formatting.
    return new NextResponse(keyAuthorization, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain', // Required by ACME spec
        // Add cache control headers to prevent caching of challenges
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Surrogate-Control': 'no-store'
      },
    });

  } catch (error) {
    console.error(`ACME Challenge: Error retrieving challenge for token ${token}:`, error);
    return new NextResponse('Internal Server Error retrieving challenge', { status: 500 });
  }
}
