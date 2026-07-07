import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';

export interface NotificationRow {
  id: string;
  type: string;
  payload: unknown;
  readAt: Date | null;
  createdAt: Date;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async notify(userId: string, type: string, payload: Record<string, unknown>): Promise<void> {
    await this.prisma.client.notification.create({
      data: { userId, type, payload: payload as Prisma.InputJsonValue },
    });
  }

  async listForUser(userId: string, limit: number, unreadOnly: boolean): Promise<NotificationRow[]> {
    return this.prisma.client.notification.findMany({
      where: { userId, ...(unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, type: true, payload: true, readAt: true, createdAt: true },
    });
  }

  async markRead(userId: string, notificationId: string): Promise<boolean> {
    const result = await this.prisma.client.notification.updateMany({
      // el filtro por userId impide marcar notificaciones ajenas
      where: { id: notificationId, userId, readAt: null },
      data: { readAt: new Date() },
    });
    return result.count === 1;
  }
}
