import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateIssueDto } from './dto/create-issue.dto';
import { IssueResult, IssuesService } from './issues.service';
import { IssueFilesService, UploadedIssueFile } from './issue-files.service';

@Controller('issues')
@UseGuards(JwtAuthGuard)
export class IssuesController {
  constructor(
    private readonly issuesService: IssuesService,
    private readonly filesService: IssueFilesService,
  ) {}

  @Post()
  @UseInterceptors(
    FilesInterceptor('files', 3, { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  createIssue(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateIssueDto,
    @UploadedFiles() files: UploadedIssueFile[] = [],
  ): Promise<IssueResult> {
    return this.filesService.save(files).then((imageUrls) =>
      this.issuesService.createIssue(request.user.sub, {
        ...dto,
        image_urls: [...(dto.image_urls ?? []), ...imageUrls],
      }),
    );
  }

  @Get()
  findUserIssues(@Req() request: AuthenticatedRequest): Promise<IssueResult[]> {
    return this.issuesService.findUserIssues(request.user.sub);
  }

  @Get(':issueId')
  findUserIssue(
    @Req() request: AuthenticatedRequest,
    @Param('issueId', ParseIntPipe) issueId: number,
  ): Promise<IssueResult> {
    return this.issuesService.findUserIssue(request.user.sub, issueId);
  }
}

@Controller('issues/files')
export class IssueFilesController {
  constructor(private readonly filesService: IssueFilesService) {}

  @Get(':filename')
  file(@Param('filename') filename: string, @Res() response: Response): void {
    response.sendFile(this.filesService.resolve(filename));
  }
}
