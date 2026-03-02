import { randomUUID } from 'crypto';
import { s3mini } from 's3mini';
import { storageConfig } from '../config/storage-config';
import {
  ConfigurationError,
  type StorageConfig,
  StorageError,
  type StorageProvider,
  UploadError,
  type UploadFileParams,
  type UploadFileResult,
} from '../types';

/**
 * Amazon S3 storage provider implementation using s3mini
 *
 * docs:
 * https://mksaas.com/docs/storage
 *
 * This provider works with Amazon S3 and compatible services like Cloudflare R2
 * using s3mini for better Cloudflare Workers compatibility
 * https://github.com/good-lly/s3mini
 * https://developers.cloudflare.com/r2/
 */
export class S3Provider implements StorageProvider {
  private config: StorageConfig;
  private s3Client: s3mini | null = null;

  constructor(config: StorageConfig = storageConfig) {
    this.config = config;
  }

  /**
   * Get the provider name
   */
  public getProviderName(): string {
    return 'S3';
  }

  /**
   * Get the S3 client instance
   */
  private getS3Client(): s3mini {
    if (this.s3Client) {
      return this.s3Client;
    }

    const { region, endpoint, accessKeyId, secretAccessKey, bucketName } =
      this.config;

    if (!region) {
      throw new ConfigurationError('Storage region is not configured');
    }

    if (!accessKeyId || !secretAccessKey) {
      throw new ConfigurationError('Storage credentials are not configured');
    }

    if (!endpoint) {
      throw new ConfigurationError('Storage endpoint is required for s3mini');
    }

    if (!bucketName) {
      throw new ConfigurationError('Storage bucket name is not configured');
    }

    // s3mini client configuration
    // For Cloudflare R2, bucket should NOT be in endpoint URL
    // For standard S3, bucket needs to be included
    const isR2 = endpoint.includes('r2.cloudflarestorage.com');

    const finalEndpoint = isR2
      ? endpoint.replace(/\/$/, '') // R2: use endpoint as-is
      : `${endpoint.replace(/\/$/, '')}/${bucketName}`; // S3: include bucket

    console.log(
      `[S3Provider] Using ${isR2 ? 'R2' : 'S3'} endpoint:`,
      finalEndpoint
    );

    this.s3Client = new s3mini({
      accessKeyId,
      secretAccessKey,
      endpoint: finalEndpoint,
      region,
    });

    return this.s3Client;
  }

  /**
   * Generate a unique filename with the original extension
   */
  private generateUniqueFilename(originalFilename: string): string {
    const extension = originalFilename.split('.').pop() || '';
    const uuid = randomUUID();
    return `${uuid}${extension ? `.${extension}` : ''}`;
  }

  /**
   * Upload a file to S3
   */
  public async uploadFile(params: UploadFileParams): Promise<UploadFileResult> {
    try {
      const { file, filename, contentType, folder } = params;
      const s3 = this.getS3Client();
      const { bucketName } = this.config;

      const uniqueFilename = this.generateUniqueFilename(filename);
      const key = folder ? `${folder}/${uniqueFilename}` : uniqueFilename;

      // Convert Blob to Buffer if needed
      let fileContent: Buffer | string;
      if (file instanceof Blob) {
        fileContent = Buffer.from(await file.arrayBuffer());
      } else {
        fileContent = file;
      }

      // Debug logging for troubleshooting
      console.log('[S3Provider] Preparing to upload:');
      console.log('  Key:', key);
      console.log('  Content-Type:', contentType);
      console.log('  File size:', fileContent.length, 'bytes');
      console.log('  Bucket:', bucketName);

      // Upload the file using s3mini
      const response = await s3.putObject(key, fileContent, contentType);

      if (!response.ok) {
        const errorMsg = `S3 returned ${response.status} – ${response.statusText}`;
        console.error('[S3Provider] Upload failed:', errorMsg);
        console.error('  Response status:', response.status);
        console.error('  Response statusText:', response.statusText);

        if (response.status === 403) {
          console.error('  🔒 403 Forbidden - Check:');
          console.error(
            '    - Access key ID and secret access key are correct'
          );
          console.error('    - R2 bucket permissions allow PutObject');
          console.error(
            '    - Endpoint URL is correct (should not include bucket for R2)'
          );
        }

        throw new UploadError(errorMsg);
      }

      console.log('[S3Provider] ✅ Upload successful');

      // Generate the URL
      const { publicUrl } = this.config;
      let url: string;

      if (publicUrl) {
        // Use custom domain if provided
        url = `${publicUrl.replace(/\/$/, '')}/${key}`;
        console.log('uploadFile, public url', url);
      } else {
        // For s3mini, we construct the URL manually
        // Since bucket is included in endpoint, we just append the key
        const baseUrl = this.config.endpoint?.replace(/\/$/, '') || '';
        url = `${baseUrl}/${key}`;
        console.log('uploadFile, constructed url', url);
      }

      return { url, key };
    } catch (error) {
      if (error instanceof ConfigurationError) {
        console.error('uploadFile, configuration error', error);
        throw error;
      }

      const message =
        error instanceof Error
          ? error.message
          : 'Unknown error occurred during file upload';
      console.error('uploadFile, error', message);
      throw new UploadError(message);
    }
  }

  /**
   * Delete a file from S3
   */
  public async deleteFile(key: string): Promise<void> {
    try {
      const s3 = this.getS3Client();

      const wasDeleted = await s3.deleteObject(key);

      if (!wasDeleted) {
        console.warn(
          `File with key ${key} was not found or could not be deleted`
        );
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unknown error occurred during file deletion';
      console.error('deleteFile, error', message);
      throw new StorageError(message);
    }
  }
}
