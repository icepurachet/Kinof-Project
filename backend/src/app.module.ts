import { Module } from '@nestjs/common';
import { MailModule } from './mail/mail.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { RoomsModule } from './rooms/rooms.module';
import { BookingsModule } from './bookings/bookings.module';
import { IssuesModule } from './issues/issues.module';
import { TrackingModule } from './tracking/tracking.module';
import { EntryModule } from './entry/entry.module';
import { AdminModule } from './admin/admin.module';
import { SuperAdminModule } from './super-admin/super-admin.module';
import { ScheduleModule } from './schedule/schedule.module';
import { AgentModule } from './agent/agent.module';
import { AdminTrackingModule } from './admin-tracking/admin-tracking.module';
import { AdminDataModule } from './admin-data/admin-data.module';
import { FaceModule } from './face/face.module';
import { LabModule } from './lab-features/lab.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'mysql',
        host: config.getOrThrow<string>('DB_HOST'),
        port: Number(config.getOrThrow<string>('DB_PORT')),
        username: config.getOrThrow<string>('DB_USERNAME'),
        password: config.getOrThrow<string>('DB_PASSWORD'),
        database: config.getOrThrow<string>('DB_DATABASE'),
        autoLoadEntities: true,
        synchronize: false,
      }),
    }),
    UsersModule,
    MailModule,
    AuthModule,
    RoomsModule,
    BookingsModule,
    IssuesModule,
    TrackingModule,
    EntryModule,
    AdminModule,
    SuperAdminModule,
    ScheduleModule,
    AgentModule,
    AdminTrackingModule,
    AdminDataModule,
    FaceModule,
    LabModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
