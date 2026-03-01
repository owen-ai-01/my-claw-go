import { type NextRequest, NextResponse } from 'next/server';

/**
 * Proxy image from R2 storage to avoid CORS and CSP issues
 * Usage: /api/proxy-image?url=https://pub-xxx.r2.dev/path/to/image.png
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const imageUrl = searchParams.get('url');

    if (!imageUrl) {
      return NextResponse.json(
        { error: 'Missing url parameter' },
        { status: 400 }
      );
    }

    // Validate URL
    let url: URL;
    try {
      url = new URL(imageUrl);
    } catch {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }

    // Only allow R2 domains for security
    const allowedDomains = [
      'pub-4da77575d4c84b63a46ce3d4067631a5.r2.dev',
      'pub-51abea15bea14bc7807f99667c9c798a.r2.dev',
      'files.hintergrundentfernenki.de',
    ];

    // Check if domain is allowed
    if (
      !allowedDomains.some(
        (domain) =>
          url.hostname === domain ||
          url.hostname.endsWith('.r2.dev') ||
          url.hostname.endsWith('.hintergrundentfernenki.de') ||
          url.hostname.endsWith('replicate.delivery') ||
          url.hostname.endsWith('replicate.com')
      )
    ) {
      return NextResponse.json(
        { error: 'Domain not allowed' },
        { status: 403 }
      );
    }

    // Fetch the image
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch image: ${response.status}` },
        { status: response.status }
      );
    }

    // Get image data
    const imageBuffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/png';

    // Return the image with proper headers
    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
      },
    });
  } catch (error) {
    console.error('Error proxying image:', error);
    return NextResponse.json(
      { error: 'Failed to proxy image' },
      { status: 500 }
    );
  }
}
