import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('users')
export class User {
  @Column({ type: 'varchar', length: 10, nullable: true, unique: true })
  student_id: string | null;
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Column({ type: 'varchar', length: 100, unique: true })
  email: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  username: string;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    select: false,
  })
  password_hash: string | null;

  @Column({ type: 'varchar', length: 50 })
  first_name: string;

  @Column({ type: 'varchar', length: 50 })
  last_name: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone: string | null;

  @Column({
    type: 'enum',
    enum: ['student', 'external'],
  })
  role: 'student' | 'external';

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    select: false,
  })
  totp_secret: string | null;

  @Column({
    type: 'text',
    nullable: true,
    select: false,
  })
  face_embedding: string | null;

  @Column({ type: 'int', default: 100 })
  usage_score: number;

  @Column({
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
  })
  created_at: Date;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @Column({ type: 'boolean', default: false })
  is_verified: boolean;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    unique: true,
    select: false,
  })
  google_id: string | null;
}
