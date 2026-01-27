'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { Plus, Star, Trash2, LayoutDashboard, StickyNote } from 'lucide-react';
import { Note } from '@/lib/types';
import { Button } from '@/components/ui/button';

const colorPalette = ['#FF6B6B', '#FFB347', '#9B59B6', '#5DADE2', '#52BE80'];

interface NoteWithId extends Note {
  id: string;
}

interface DraftNote {
  id: string;
  title: string;
  content: string;
  color: string;
}

export default function NotesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState<NoteWithId[]>([]);
  const [loading, setLoading] = useState(true);
  const [draftNote, setDraftNote] = useState<DraftNote | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<'title' | 'content' | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const titleInputRef = useRef<HTMLInputElement>(null);
  const contentTextareaRef = useRef<HTMLTextAreaElement>(null);
  const draftTitleRef = useRef<HTMLInputElement>(null);
  const draftContentRef = useRef<HTMLTextAreaElement>(null);
  const hasFetchedRef = useRef(false);
  const colorIndexRef = useRef(0);
  const draftIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;

    const fetchNotes = async () => {
      try {
        const response = await fetch('/api/notes');
        if (response.ok) {
          const data = await response.json();
          setNotes(data.notes || []);
        } else if (response.status === 401) {
          router.push('/login');
        }
      } catch {
        toast.error('Failed to fetch notes');
      } finally {
        setLoading(false);
      }
    };

    fetchNotes();
  }, []);

  useEffect(() => {
    if (editingNoteId && editingField === 'title' && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    } else if (editingNoteId && editingField === 'content' && contentTextareaRef.current) {
      contentTextareaRef.current.focus();
    }
  }, [editingNoteId, editingField]);

  useEffect(() => {
    if (draftNote && draftNote.id !== draftIdRef.current) {
      draftIdRef.current = draftNote.id;
      setTimeout(() => {
        draftTitleRef.current?.focus();
      }, 0);
    }
    if (!draftNote) {
      draftIdRef.current = null;
    }
  }, [draftNote?.id]);

  const handleCreateDraft = useCallback(() => {
    if (draftNote) return; // Already have a draft

    const color = colorPalette[colorIndexRef.current % colorPalette.length];
    colorIndexRef.current += 1;

    setDraftNote({
      id: 'draft-' + Date.now(),
      title: '',
      content: '',
      color,
    });
  }, [draftNote]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        handleCreateDraft();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleCreateDraft]);

  const handleSaveDraft = async () => {
    if (!draftNote) return;

    const title = draftNote.title.trim();
    const content = draftNote.content.trim();

    if (!title && !content) {
      setDraftNote(null);
      return;
    }

    try {
      const response = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title || 'Untitled',
          content: content,
          color: draftNote.color,
          isFavorite: false,
          showOnDashboard: false,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setNotes([data.note, ...notes]);
        setDraftNote(null);
      } else {
        const errorData = await response.json();
        toast.error(errorData.error || 'Failed to create note');
      }
    } catch {
      toast.error('Failed to create note');
    }
  };

  const handleDraftBlur = (e: React.FocusEvent) => {
    const relatedTarget = e.relatedTarget as HTMLElement;
    const draftCard = e.currentTarget.closest('[data-draft-card]');
    
    if (draftCard && relatedTarget && draftCard.contains(relatedTarget)) {
      return;
    }

    handleSaveDraft();
  };

  const handleStartEdit = (note: NoteWithId, field: 'title' | 'content') => {
    setEditingNoteId(note.id);
    setEditingField(field);
    setEditTitle(note.title);
    setEditContent(note.content || '');
  };

  const handleSaveNote = async (noteId: string) => {
    const note = notes.find((n) => n.id === noteId);
    if (!note) return;

    const newTitle = editingField === 'title' ? editTitle.trim() : note.title;
    const newContent = editingField === 'content' ? editContent : note.content;

    if (newTitle === note.title && newContent === (note.content || '')) {
      setEditingNoteId(null);
      setEditingField(null);
      return;
    }

    try {
      const response = await fetch(`/api/notes/${noteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle || 'Untitled',
          content: newContent,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setNotes(notes.map((n) => (n.id === noteId ? data.note : n)));
        setEditingNoteId(null);
        setEditingField(null);
      } else {
        const errorData = await response.json();
        toast.error(errorData.error || 'Failed to update note');
      }
    } catch {
      toast.error('Failed to update note');
    }
  };

  const handleCancelEdit = () => {
    setEditingNoteId(null);
    setEditingField(null);
    setEditTitle('');
    setEditContent('');
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!confirm('Are you sure you want to delete this note?')) return;

    try {
      const response = await fetch(`/api/notes/${noteId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setNotes(notes.filter((n) => n.id !== noteId));
        toast.success('Note deleted');
      } else {
        const errorData = await response.json();
        toast.error(errorData.error || 'Failed to delete note');
      }
    } catch {
      toast.error('Failed to delete note');
    }
  };

  const handleToggleFavorite = async (note: NoteWithId) => {
    try {
      const response = await fetch(`/api/notes/${note.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isFavorite: !note.isFavorite,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setNotes(notes.map((n) => (n.id === note.id ? data.note : n)));
      } else {
        toast.error('Failed to update favorite');
      }
    } catch {
      toast.error('Failed to update favorite');
    }
  };

  const handleToggleDashboard = async (note: NoteWithId) => {
    try {
      const response = await fetch(`/api/notes/${note.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          showOnDashboard: !note.showOnDashboard,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setNotes(notes.map((n) => (n.id === note.id ? data.note : n)));
        queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        toast.success(
          !note.showOnDashboard
            ? 'Note pinned to dashboard'
            : 'Note unpinned from dashboard'
        );
      } else {
        toast.error('Failed to update dashboard visibility');
      }
    } catch {
      toast.error('Failed to update dashboard visibility');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header Skeleton */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gray-200 animate-pulse" />
              <div>
                <div className="h-7 w-24 bg-gray-200 rounded animate-pulse mb-2" />
                <div className="h-4 w-16 bg-gray-200 rounded animate-pulse" />
              </div>
            </div>
            <div className="h-10 w-32 bg-gray-200 rounded-lg animate-pulse" />
          </div>

          {/* Masonry Skeleton */}
          <div className="masonry-grid">
            {[180, 240, 160, 200, 280, 180, 220, 160].map((height, i) => (
              <div
                key={i}
                className="masonry-item rounded-xl bg-gray-200 animate-pulse"
                style={{ height: `${height}px` }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const showEmptyState = notes.length === 0 && !draftNote;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-100 shadow-sm">
              <StickyNote className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Notes</h1>
              <p className="text-gray-500 text-sm">
                {notes.length} {notes.length === 1 ? 'note' : 'notes'}
              </p>
            </div>
          </div>

          {/* Create Note Button */}
          <Button
            onClick={handleCreateDraft}
            className="bg-slate-900 hover:bg-slate-800 text-white gap-2"
            title="Create new note (Ctrl+N)"
            disabled={!!draftNote}
          >
            <Plus className="w-4 h-4" />
            New Note
          </Button>
        </div>

        {/* Empty State */}
        {showEmptyState ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-20"
          >
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-amber-100 flex items-center justify-center shadow-sm">
              <StickyNote className="w-10 h-10 text-amber-500" strokeWidth={1.5} />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              No notes yet
            </h3>
            <p className="text-gray-500 mb-6 max-w-sm mx-auto">
              Create your first note to keep track of important information and ideas.
            </p>
            <Button
              onClick={handleCreateDraft}
              className="bg-slate-900 hover:bg-slate-800 text-white"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create your first note
            </Button>
          </motion.div>
        ) : (
          /* Masonry Grid */
          <div className="masonry-grid">
            {/* Draft Note Card */}
            {draftNote && (
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.2 }}
                className="masonry-item"
              >
                <div
                  data-draft-card
                  className="note-card group rounded-xl bg-white border-2 border-dashed border-gray-300 shadow-sm overflow-hidden"
                >
                  {/* Color Accent Bar */}
                  <div
                    className="h-1.5"
                    style={{ backgroundColor: draftNote.color }}
                  />

                  <div className="p-4">
                    {/* Title Input */}
                    <input
                      ref={draftTitleRef}
                      type="text"
                      value={draftNote.title}
                      onChange={(e) => setDraftNote({ ...draftNote, title: e.target.value })}
                      onBlur={handleDraftBlur}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          draftContentRef.current?.focus();
                        } else if (e.key === 'Escape') {
                          setDraftNote(null);
                        }
                      }}
                      className="text-base font-semibold text-gray-900 w-full bg-transparent focus:outline-none border-b-2 border-gray-300 focus:border-gray-500 pb-1 mb-3"
                      placeholder="Note title..."
                    />

                    {/* Content Textarea */}
                    <textarea
                      ref={draftContentRef}
                      value={draftNote.content}
                      onChange={(e) => setDraftNote({ ...draftNote, content: e.target.value })}
                      onBlur={handleDraftBlur}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          setDraftNote(null);
                        }
                      }}
                      className="hide-scrollbar text-sm text-gray-600 w-full bg-gray-50 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-gray-200 resize-none min-h-[80px]"
                      placeholder="Write your note here..."
                    />

                    {/* Footer hint */}
                    <p className="text-xs text-gray-400 mt-3 pt-3 border-t border-gray-100">
                      Click outside to save • Press Esc to cancel
                    </p>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Existing Notes */}
            {notes.map((note) => (
              <motion.div
                key={note.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 1 }}
                transition={{ duration: 0.3 }}
                className="masonry-item"
              >
                <div className="note-card group rounded-xl bg-white border border-gray-200 shadow-sm overflow-hidden">
                  {/* Color Accent Bar */}
                  <div
                    className="h-1.5"
                    style={{ backgroundColor: note.color }}
                  />

                  <div className="p-4">
                    {/* Header with Title and Status Icons */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        {editingNoteId === note.id && editingField === 'title' ? (
                          <input
                            ref={titleInputRef}
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            onBlur={() => handleSaveNote(note.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleSaveNote(note.id);
                              } else if (e.key === 'Escape') {
                                handleCancelEdit();
                              }
                            }}
                            className="text-base font-semibold text-gray-900 w-full bg-transparent focus:outline-none border-b-2 border-gray-300 focus:border-gray-500 pb-1"
                            placeholder="Note title"
                          />
                        ) : (
                          <h3
                            onClick={() => handleStartEdit(note, 'title')}
                            className="text-base font-semibold text-gray-900 cursor-text hover:text-gray-700 transition-colors wrap-break-word"
                          >
                            {note.title}
                          </h3>
                        )}
                      </div>

                      {/* Status Icons (always visible) */}
                      <div className="flex items-center gap-1 shrink-0">
                        {note.showOnDashboard && (
                          <div className="p-1 rounded bg-blue-50" title="Pinned to dashboard">
                            <LayoutDashboard className="w-3.5 h-3.5 text-blue-600" />
                          </div>
                        )}
                        {note.isFavorite && (
                          <div className="p-1 rounded bg-amber-50" title="Favorite">
                            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Content */}
                    <div className="mb-3">
                      {editingNoteId === note.id && editingField === 'content' ? (
                        <textarea
                          ref={contentTextareaRef}
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          onBlur={() => handleSaveNote(note.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                              handleCancelEdit();
                            }
                          }}
                          className="hide-scrollbar text-sm text-gray-600 w-full bg-gray-50 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-gray-200 resize-none min-h-[100px]"
                          placeholder="Write your note here..."
                        />
                      ) : (
                        <div
                          onClick={() => handleStartEdit(note, 'content')}
                          className="text-sm text-gray-600 cursor-text whitespace-pre-wrap wrap-break-word leading-relaxed"
                        >
                          {note.content || (
                            <span className="text-gray-400 italic">
                              Click to add content...
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Footer with Date and Actions */}
                    <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                      <span className="text-xs text-gray-400">
                        {format(new Date(note.createdAt), 'MMM d, yyyy')}
                      </span>

                      {/* Action Buttons - always visible on mobile, hover on desktop */}
                      <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleToggleFavorite(note)}
                          className={`p-1.5 rounded-lg transition-colors ${
                            note.isFavorite
                              ? 'bg-amber-50 text-amber-500'
                              : 'hover:bg-gray-100 text-gray-400 hover:text-gray-600'
                          }`}
                          title={note.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                        >
                          <Star
                            className={`w-4 h-4 ${note.isFavorite ? 'fill-current' : ''}`}
                          />
                        </button>
                        <button
                          onClick={() => handleToggleDashboard(note)}
                          className={`p-1.5 rounded-lg transition-colors ${
                            note.showOnDashboard
                              ? 'bg-blue-50 text-blue-600'
                              : 'hover:bg-gray-100 text-gray-400 hover:text-gray-600'
                          }`}
                          title={
                            note.showOnDashboard
                              ? 'Unpin from dashboard'
                              : 'Pin to dashboard'
                          }
                        >
                          <LayoutDashboard className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteNote(note.id)}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
                          title="Delete note"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
