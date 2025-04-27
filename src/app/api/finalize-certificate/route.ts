
/**
 * @fileoverview API Route handler for finalizing a certificate order.
 * This is called by the frontend after the HTTP-01 challenge has been successfully verified.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import acme from 'acme-client';
import { getAcmeClient } from '@/lib/acme-client';
import { retrievePendingOrder, removePendingOrder, storeCertificate, CertificateConfig } from '@/lib/acme-storage'; // Need pending data, removal, and final storage
import type { Certificate } from '@/services/cert-magic'; // Use type from service

interface FinalizeRequestBody {
    orderUrl: string; // URL of the ACME order to finalize
    domain: string;   // Domain name (for context/logging/storage)
}

export async function POST(request: NextRequest) {
    try {
        const body: FinalizeRequestBody = await request.json();
        const { orderUrl, domain } = body;

        console.log(`API: Received certificate finalization request for ${domain}, Order URL: ${orderUrl}`);

        if (!orderUrl || !domain) {
            return NextResponse.json({ error: 'Missing orderUrl or domain' }, { status: 400 });
        }

        // Retrieve the stored pending order details (includes CSR and private key)
        const pendingOrder = await retrievePendingOrder(orderUrl);
        if (!pendingOrder) {
            console.error(`Finalization Error: Could not find pending order details for ${orderUrl}`);
            return NextResponse.json({ error: 'Pending order details not found. Verification might have expired or failed previously.' }, { status: 404 });
        }

        // Basic check to ensure consistency
        if (pendingOrder.domain !== domain) {
             console.error(`Finalization Error: Domain mismatch in pending order for ${orderUrl}. Expected ${domain}, found ${pendingOrder.domain}`);
             return NextResponse.json({ error: 'Domain mismatch in pending order data.' }, { status: 400 });
        }


        const client = await getAcmeClient();

        // Need the Order object and the CSR to finalize
        // We stored the CSR PEM, need to convert it back or pass PEM string
        const csr = pendingOrder.csrPem; // Assuming acme-client can take CSR PEM string

        // We need the Order object. Let's fetch it using the order URL.
        // acme-client's finalizeOrder likely needs the object fetched via client.getOrder(orderUrl)
        // or potentially just the orderUrl itself along with the client state.
        // Let's fetch the Order object explicitly for clarity.
        // NOTE: This might not be strictly necessary if `client.finalizeOrder` can work with just the URL,
        // but fetching ensures we have the latest order status before finalizing.
        console.log(`Fetching latest order details from ${orderUrl}`);
        // Need to fetch the Order object using client.getOrder() before finalizing
        const orderResponse = await client.getOrder({ url: orderUrl }); // Fetch order using its URL
        const order = orderResponse; // Assuming getOrder returns the Order object directly or in a property


        if (order.status !== 'ready') {
             console.error(`Finalization Error: Order ${orderUrl} is not in 'ready' state (current state: ${order.status}). Verification might not be complete or has expired.`);
              // Clean up pending state if order is invalid?
              if (order.status === 'invalid') {
                 await removePendingOrder(orderUrl);
              }
             return NextResponse.json({ error: `Cannot finalize order. Status is '${order.status}', expected 'ready'.` }, { status: 400 });
        }


        console.log(`Finalizing order ${orderUrl} for domain ${domain}...`);
        // Use the retrieved pendingOrder.csrPem and the fetched order object
        const finalizedOrder = await client.finalizeOrder(order, csr);
        console.log('Order finalized successfully.');

        /* Get certificate */
        console.log('Downloading certificate...');
        const certificatePem = await client.getCertificate(finalizedOrder);
        console.log('Certificate downloaded successfully.');

        // Retrieve the private key stored with the pending order
        const privateKeyPem = pendingOrder.privateKeyPem;

        // Store the final certificate, key, and config
        const config: CertificateConfig = {
            domain: domain,
            challengeType: 'http-01', // We know it was HTTP-01 for this flow
            dnsConfig: undefined
        };
        await storeCertificate(domain, certificatePem, privateKeyPem, config);

        // Clean up the pending order state
        await removePendingOrder(orderUrl);

        const expiryDate = acme.crypto.readCertificateInfo(certificatePem).notAfter;

        const generatedCertificate: Certificate = {
            status: 'issued',
            domain: domain,
            certificatePem: certificatePem,
            privateKeyPem: privateKeyPem, // Still insecure to return!
            challengeType: 'http-01',
            expiresAt: expiryDate,
            message: `Certificate issued successfully for ${domain} via manual HTTP-01.`,
        };

        console.log(`API: Successfully finalized and stored certificate for ${domain}. Expires: ${expiryDate}`);
        return NextResponse.json(generatedCertificate, { status: 200 });

    } catch (error: any) {
        console.error('API Error in /api/finalize-certificate:', error);

        // Don't automatically remove pending order on error, as retry might be possible
        // unless the error is definitive (e.g., order invalid).

        let errorMessage = 'Failed to finalize certificate.';
        if (error instanceof Error) errorMessage = error.message;
        else if (typeof error === 'string') errorMessage = error;

        if (error.response?.data?.detail) {
            errorMessage = `ACME Server Error during finalization: ${error.response.data.detail}`;
        } else if (error.message?.includes('Order is not in ready state')) {
             errorMessage = `Finalization failed: Order status is not 'ready'. Verification might have failed or expired. ${error.message}`;
        }

        console.error('Detailed Finalization Error:', JSON.stringify(error, null, 2));
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
    
