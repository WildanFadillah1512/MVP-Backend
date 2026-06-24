import prisma from '../utils/prisma';

interface CreateNotificationParams {
  userId: string;
  title: string;
  message: string;
  type: string;
  link?: string;
  metadata?: any;
}

export const createNotification = async (params: CreateNotificationParams) => {
  try {
    const notification = await prisma.notification.create({
      data: {
        userId: params.userId,
        title: params.title,
        message: params.message,
        type: params.type,
        link: params.link,
        metadata: params.metadata ? JSON.stringify(params.metadata) : null,
      },
    });

    return notification;
  } catch (error) {
    console.error('Error creating notification:', error);
    throw error;
  }
};

export const createBulkNotifications = async (notifications: CreateNotificationParams[]) => {
  try {
    const data = notifications.map((n) => ({
      userId: n.userId,
      title: n.title,
      message: n.message,
      type: n.type,
      link: n.link,
      metadata: n.metadata ? JSON.stringify(n.metadata) : null,
    }));

    await prisma.notification.createMany({
      data,
      skipDuplicates: true,
    });

    return { success: true, count: data.length };
  } catch (error) {
    console.error('Error creating bulk notifications:', error);
    throw error;
  }
};

export const getUnreadNotifications = async (userId: string) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: {
        userId,
        isRead: false,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 50,
    });

    return notifications;
  } catch (error) {
    console.error('Error getting unread notifications:', error);
    throw error;
  }
};

export const markAsRead = async (notificationId: string) => {
  try {
    await prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    throw error;
  }
};

export const markAllAsRead = async (userId: string) => {
  try {
    await prisma.notification.updateMany({
      where: {
        userId,
        isRead: false,
      },
      data: {
        isRead: true,
      },
    });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    throw error;
  }
};
