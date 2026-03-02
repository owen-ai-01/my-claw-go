import QRCode from 'qrcode';

/**
 * QR码生成服务
 * 将URL转换为可访问的QR码图片URL
 */
export class QRCodeGenerator {
  /**
   * 生成QR码并返回Data URL
   * @param url 要编码的URL
   * @returns QR码的Data URL (base64编码的PNG图片)
   */
  async generateDataUrl(url: string): Promise<string> {
    console.log(
      `[QRCode] 📱 Generating QR code for URL: ${url.substring(0, 50)}...`
    );

    try {
      // 生成QR码为Data URL (base64 PNG)
      const dataUrl = await QRCode.toDataURL(url, {
        type: 'image/png',
        width: 200,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
        errorCorrectionLevel: 'M',
      });

      console.log(`[QRCode] ✅ QR code generated successfully`);
      return dataUrl;
    } catch (error) {
      console.error('[QRCode] ❌ Failed to generate QR code:', error);
      throw error;
    }
  }

  /**
   * 生成QR码并上传到临时存储，返回可访问的URL
   * 由于Shotstack需要可访问的URL，我们使用免费的图片托管服务
   * @param url 要编码的URL
   * @returns 可访问的QR码图片URL
   */
  async generateAccessibleUrl(url: string): Promise<string> {
    console.log(
      `[QRCode] 📱 Generating accessible QR code URL for: ${url.substring(0, 50)}...`
    );

    try {
      // 首先生成QR码为buffer
      const buffer = await QRCode.toBuffer(url, {
        type: 'png',
        width: 200,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
        errorCorrectionLevel: 'M',
      });

      // 使用免费的图片托管API (imgbb 或类似服务)
      // 由于这是临时用途，我们也可以使用Data URL转换的方式
      // Shotstack支持一些特殊的内联方式

      // 方案1: 使用Data URL (如果Shotstack支持)
      const dataUrl = `data:image/png;base64,${buffer.toString('base64')}`;

      // 方案2: 使用公共QR码生成API (备选)
      // 如果Data URL不被支持，可以使用外部服务
      const fallbackUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`;

      console.log(`[QRCode] ✅ QR code URLs prepared`);
      console.log(
        `[QRCode] Primary (data URL): ${dataUrl.substring(0, 50)}...`
      );
      console.log(
        `[QRCode] Fallback (qrserver): ${fallbackUrl.substring(0, 80)}...`
      );

      // 返回公共API URL，因为Shotstack可能不支持Data URL
      return fallbackUrl;
    } catch (error) {
      console.error('[QRCode] ❌ Failed to generate QR code:', error);
      throw error;
    }
  }
}
