import {
  BadGatewayException,
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { gunzipSync } from 'zlib';
import { rows } from './lab.service';
const catalog = [
  ['social_networks', 'โซเชียลเน็ตเวิร์ก'],
  ['streaming', 'วิดีโอ/เพลง'],
  ['games', 'เกม'],
  ['adult', 'เนื้อหาผู้ใหญ่'],
  ['gambling', 'พนัน'],
  ['malware', 'มัลแวร์'],
  ['phishing', 'ฟิชชิง'],
  ['chat', 'แชท'],
  ['dating', 'หาคู่'],
];
@Injectable()
export class DomainCatalogService {
  constructor(private readonly db: DataSource) {}
  async list() {
    const counts = rows(
      await this.db.query(
        'SELECT category,COUNT(*) AS count,MAX(imported_at) AS lastImportedAt FROM imported_domain_rules GROUP BY category',
      ),
    );
    return {
      source: 'https://dsi.ut-capitole.fr/blacklists/index_en.php',
      defaultLimit: 250,
      maxLimit: 400,
      items: catalog.map(([id, label]) => ({
        id,
        label,
        description: label,
        importedCount: Number(
          counts.find((r) => r.category === id)?.count ?? 0,
        ),
        lastImportedAt:
          counts.find((r) => r.category === id)?.lastImportedAt ?? null,
        sampleDomains: [],
      })),
    };
  }
  async import(admin: number, category: string, limit = 250) {
    if (!catalog.some(([id]) => id === category))
      throw new BadRequestException('หมวดไม่ถูกต้อง');
    let domains: string[] = [];
    try {
      const response = await fetch(
        `https://dsi.ut-capitole.fr/blacklists/download/${category}.tar.gz`,
        { signal: AbortSignal.timeout(20000), redirect: 'error' },
      );
      if (!response.ok || !response.body) throw new Error('download');
      const chunks: Buffer[] = [];
      let length = 0;
      for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
        length += chunk.length;
        if (length > 20 * 1024 * 1024) throw new Error('size');
        chunks.push(Buffer.from(chunk));
      }
      const tar = gunzipSync(Buffer.concat(chunks), {
        maxOutputLength: 128 * 1024 * 1024,
      });
      for (let pos = 0; pos + 512 <= tar.length;) {
        const name = tar
          .subarray(pos, pos + 100)
          .toString()
          .replace(/\0.*$/s, '');
        const size =
          parseInt(
            tar
              .subarray(pos + 124, pos + 136)
              .toString()
              .replace(/\0/g, '')
              .trim(),
            8,
          ) || 0;
        if (!name) break;
        if (pos + 512 + size > tar.length) throw new Error('archive');
        if (name.endsWith('/domains') || name === 'domains') {
          domains = tar
            .subarray(pos + 512, pos + 512 + size)
            .toString('utf8')
            .split(/\r?\n/)
            .map((s) => s.trim().toLowerCase())
            .filter(
              (s) =>
                s.length <= 253 &&
                /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(s),
            )
            .slice(0, limit);
          break;
        }
        pos += 512 + Math.ceil(size / 512) * 512;
      }
      if (!domains.length) throw new Error('empty');
    } catch {
      throw new BadGatewayException(
        'ดาวน์โหลดรายการ UT1 ไม่สำเร็จ กรุณาลองใหม่',
      );
    }
    let added = 0;
    await this.db.transaction(async (m) => {
      for (const domain of new Set(domains)) {
        const existing = rows(
          await m.query('SELECT id FROM blocked_domains WHERE domain_name=?', [
            domain,
          ]),
        )[0];
        if (existing) continue; // Preserve rules created by administrators.
        const result = await m.query(
          "INSERT INTO blocked_domains (domain_name,category,severity,action,match_type,is_enabled) VALUES (?,?,'medium','block','suffix',1)",
          [domain, category],
        );
        await m.query(
          'INSERT INTO imported_domain_rules (domain_id,category) VALUES (?,?)',
          [result.insertId, category],
        );
        added++;
      }
      await m.query('INSERT INTO audit_logs (admin_id,action) VALUES (?,?)', [
        admin,
        `import UT1 ${category}: ${added}`,
      ]);
    });
    return {
      added,
      importedCount: added,
      message: `นำเข้า ${added} โดเมนแล้ว`,
    };
  }
  async remove(admin: number, category: string) {
    if (!catalog.some(([id]) => id === category))
      throw new BadRequestException('หมวดไม่ถูกต้อง');
    await this.db.transaction(async (m) => {
      await m.query(
        'DELETE bd FROM blocked_domains bd JOIN imported_domain_rules ir ON ir.domain_id=bd.id WHERE ir.category=?',
        [category],
      );
      await m.query('INSERT INTO audit_logs (admin_id,action) VALUES (?,?)', [
        admin,
        `remove UT1 ${category}`,
      ]);
    });
    return { message: 'ลบรายการที่นำเข้าแล้ว' };
  }
}
