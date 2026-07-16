// @ts-nocheck
import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { successResponse, errorResponse } from '../utils/response';
import { getIO } from '../socket';

export const getGroups = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    
    // User can see groups they are a member of
    const groups = await prisma.chatGroup.findMany({
      where: {
        members: {
          some: { userId }
        }
      },
      include: {
        _count: {
          select: { members: true }
        }
      }
    });
    
    return successResponse(res, groups, 'Daftar grup chat berhasil diambil');
  } catch (error) {
    return errorResponse(res, 'Gagal mengambil daftar chat grup', null, 500);
  }
};

export const getMessages = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.id;

    // Verify membership
    const isMember = await prisma.chatGroupMember.findUnique({
      where: { groupId_userId: { groupId: id, userId } }
    });

    if (!isMember) {
      return errorResponse(res, 'Anda tidak tergabung dalam grup ini', null, 403);
    }

    const messages = await prisma.chatMessage.findMany({
      where: { groupId: id },
      include: {
        sender: { select: { id: true, name: true, role: { select: { name: true } } } }
      },
      orderBy: { createdAt: 'asc' },
      take: 100 // Limit for polling
    });

    return successResponse(res, messages, 'Pesan berhasil diambil');
  } catch (error) {
    return errorResponse(res, 'Gagal mengambil pesan', null, 500);
  }
};

export const sendMessage = async (req: Request, res: Response) => {
  try {
    const { id } = req.params; // Group ID
    const userId = (req as any).user.id;
    const { content, fileUrl, fileName, fileType, fileSize } = req.body;

    const isMember = await prisma.chatGroupMember.findUnique({
      where: { groupId_userId: { groupId: id, userId } }
    });

    if (!isMember) {
      return errorResponse(res, 'Anda tidak tergabung dalam grup ini', null, 403);
    }

    const message = await prisma.chatMessage.create({
      data: {
        groupId: id,
        senderId: userId,
        content,
        fileUrl,
        fileName,
        fileType,
        fileSize: fileSize ? Number(fileSize) : null
      },
      include: {
        sender: { select: { id: true, name: true, role: { select: { name: true } } } }
      }
    });

    const io = getIO();
    io.to(id).emit('new-message', message);

    return successResponse(res, message, 'Pesan terkirim');
  } catch (error) {
    return errorResponse(res, 'Gagal mengirim pesan', null, 500);
  }
};
