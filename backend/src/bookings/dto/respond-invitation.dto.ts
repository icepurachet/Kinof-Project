import { IsIn } from 'class-validator';

export const INVITATION_RESPONSES = ['accepted', 'declined'] as const;
export type InvitationResponse = (typeof INVITATION_RESPONSES)[number];

export class RespondInvitationDto {
  @IsIn(INVITATION_RESPONSES)
  response: InvitationResponse;
}
