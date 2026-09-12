import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { extname, resolve } from 'path';

export interface UploadedIssueFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class IssueFilesService {
  private readonly allowedTypes = new Map([
    ['image/jpeg', '.jpg'],
    ['image/png', '.png'],
    ['image/webp', '.webp'],
  ]);

  constructor(private readonly config: ConfigService) {}

  async save(files: UploadedIssueFile[]): Promise<string[]> {
    if (files.length > 3) {
      throw new BadRequestException('แนบรูปได้สูงสุด 3 รูป');
    }
    const directory = this.storageDirectory();
    await mkdir(directory, { recursive: true });

    return Promise.all(
      files.map(async (file) => {
        const extension = this.allowedTypes.get(file.mimetype);
        if (
          !extension ||
          file.size <= 0 ||
          file.size > 5 * 1024 * 1024 ||
          !this.hasExpectedSignature(file.buffer, extension)
        ) {
          throw new BadRequestException(
            'รูปแนบต้องเป็น JPEG, PNG หรือ WebP และไม่เกิน 5 MB',
          );
        }
        const filename = `${randomUUID()}${extension}`;
        await writeFile(resolve(directory, filename), file.buffer, {
          flag: 'wx',
        });
        return `/issues/files/${filename}`;
      }),
    );
  }

  resolve(filename: string): string {
    if (!/^[0-9a-f-]{36}\.(?:jpg|png|webp)$/.test(filename)) {
      throw new NotFoundException('ไม่พบรูปภาพ');
    }
    const file = resolve(this.storageDirectory(), filename);
    if (extname(file) === '') throw new NotFoundException('ไม่พบรูปภาพ');
    return file;
  }

  private storageDirectory(): string {
    return resolve(
      this.config.get<string>('ISSUE_UPLOAD_DIR') ?? 'storage/issues',
    );
  }

  private hasExpectedSignature(buffer: Buffer, extension: string): boolean {
    if (extension === '.jpg') return buffer[0] === 0xff && buffer[1] === 0xd8;
    if (extension === '.png') {
      return buffer
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    }
    return (
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }
}
