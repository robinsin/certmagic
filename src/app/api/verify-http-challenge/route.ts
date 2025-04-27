
/**
 * @fileoverview API Route handler for verifying a pending HTTP-01 challenge.
 * This is called by the frontend after the user has manually placed the
 * challenge file on their server.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import acme from 'acme-client';
import { getAcmeClient } from '@/lib/acme-client';
import { retrievePendingOrder } from '@/lib/acme-storage'; // Need to get challenge details

interface VerifyHttpRequestBody {
    challengeUrl: string; // URL of the ACME challenge object
    orderUrl: string;     // URL of the ACME order (for context/logging)
    domain: string;       // Domain name (for context/logging)
}

export async function POST(request: NextRequest) {
    try {
        const body: VerifyHttpRequestBody = await request.json();
        const { challengeUrl, orderUrl, domain } = body;

        console.log(`API: Received HTTP-01 verification request for ${domain}, Challenge URL: ${challengeUrl}`);

        if (!challengeUrl || !orderUrl || !domain) {
            return NextResponse.json({ error: 'Missing challengeUrl, orderUrl, or domain' }, { status: 400 });
        }

        // Retrieve the full challenge details stored previously (might not strictly be needed
        // if we have the challenge URL, but good for validation/context)
        const pendingOrder = await retrievePendingOrder(orderUrl);
        if (!pendingOrder || pendingOrder.challengeUrl !== challengeUrl) {
             console.error(`Verification Error: Could not find matching pending order for order ${orderUrl} and challenge ${challengeUrl}`);
             return NextResponse.json({ error: 'Pending order details not found or challenge URL mismatch.' }, { status: 404 });
        }
         // Ensure the challenge exists and is of the correct type (basic check)
         if (!pendingOrder.challengeUrl.includes(pendingOrder.token)) {
             console.error(`Verification Error: Stored challenge details seem inconsistent for ${domain}.`);
             return NextResponse.json({ error: 'Internal inconsistency in stored challenge data.' }, { status: 500 });
         }

        const client = await getAcmeClient();

        // Need the challenge *object* itself to complete it.
        // While acme-client v5+ might allow completing by URL in some contexts,
        // it's generally safer and more explicit to fetch the challenge object first
        // if you only have the URL. However, since we initiated the order recently,
        // the challenge *should* still be accessible via the order. Let's try using
        // client.completeChallenge directly, assuming the client maintains state or
        // can resolve the challenge from the URL implicitly or we pass enough context.
        // *Correction*: `completeChallenge` requires the challenge *object*. We need to simulate getting it.
        // In a real scenario, you might re-fetch the order/authorization to get the challenge object
        // or assume the client object still holds reference to it if the process is quick.
        // Let's assume `completeChallenge` needs the object structure. We stored token/keyAuth.
        // We'll pass the stored challenge URL and token to completeChallenge.
        // `acme-client` v5 `completeChallenge` takes the challenge object { url, token, type, status }
        // Let's construct a minimal challenge object needed for completion.
         const challengeObject = {
             url: pendingOrder.challengeUrl,
             token: pendingOrder.token,
             type: 'http-01', // We know this is HTTP-01
             status: 'pending' // Assume it's pending when verification is requested
         };


        console.log(`Notifying ACME server to validate challenge: ${challengeObject.url}`);
        await client.completeChallenge(challengeObject); // Pass the minimal object

        console.log(`Waiting for ACME server validation for ${domain}...`);
        // Wait for validation status. client.waitForValidStatus also needs the challenge object.
        const updatedChallenge = await client.waitForValidStatus(challengeObject); // Wait for 'valid' status

        console.log(`Challenge validation status for ${domain}: ${updatedChallenge.status}`);

        if (updatedChallenge.status === 'valid') {
             // IMPORTANT: Do NOT remove the pending order data yet.
             // It's needed for the finalization step.
             console.log(`HTTP-01 Verification successful for ${domain}.`);
             return NextResponse.json({
                 status: 'valid',
                 message: `Challenge successfully verified for ${domain}. Ready to finalize.`
             }, { status: 200 });
        } else {
             console.error(`HTTP-01 Verification failed for ${domain}. Status: ${updatedChallenge.status}`);
             // Optionally remove pending order data if verification definitively fails? Or allow retry? Let's allow retry for now.
             return NextResponse.json({
                 status: 'invalid',
                 message: `Challenge verification failed. Status: ${updatedChallenge.status}. Please check the file and try again.`
             }, { status: 400 }); // Use 400 Bad Request as the client's setup was likely wrong
        }

    } catch (error: any) {
        console.error('API Error in /api/verify-http-challenge:', error);
        let errorMessage = 'Failed to verify HTTP challenge.';
        if (error instanceof Error) errorMessage = error.message;
        else if (typeof error === 'string') errorMessage = error;

         // Check for specific ACME errors related to verification
         if (error.response?.data?.detail) {
            errorMessage = `ACME Server Error during verification: ${error.response.data.detail}`;
        } else if (error.message?.includes('Verify error') || error.message?.includes('challenge status was not valid')) {
             errorMessage = `ACME challenge verification failed. Check server setup. Details: ${error.message}`;
        } else if (error.message?.includes('rateLimited')) {
             errorMessage = 'Verification failed due to rate limiting. Please wait and try again later.';
        }


        console.error('Detailed Verification Error:', JSON.stringify(error, null, 2));
        // Return status 'invalid' on generic errors too, prompting user check
        return NextResponse.json({ status:'invalid', error: errorMessage }, { status: 500 });
    }
}
    
