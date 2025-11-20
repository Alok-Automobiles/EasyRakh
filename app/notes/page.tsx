'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Star, X } from '@phosphor-icons/react';
import { Note } from '@/lib/types';

const colorPalette = [
  { name: 'orange', value: '#FFB347' },
  { name: 'red-orange', value: '#FF6B6B' },
  { name: 'purple', value: '#9B59B6' },
  { name: 'light-blue', value: '#5DADE2' },
  { name: 'light-green', value: '#52BE80' },
];

interface NoteWithId extends Note {
  id: string;
}

export default function NotesPage() {
  const router = useRouter();
  const [notes, setNotes] = useState<NoteWithId[]>([]);
  const [loading, setLoading] = useState(true);
  const [isColorDropdownOpen, setIsColorDropdownOpen] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<'title' | 'content' | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const contentTextareaRef = useRef<HTMLTextAreaElement>(null);
  const hasFetchedRef = useRef(false);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsColorDropdownOpen(false);
      }
    };

    if (isColorDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isColorDropdownOpen]);

  // Focus input/textarea when editing starts
  useEffect(() => {
    if (editingNoteId && editingField === 'title' && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    } else if (editingNoteId && editingField === 'content' && contentTextareaRef.current) {
      contentTextareaRef.current.focus();
    }
  }, [editingNoteId, editingField]);

  const handleCreateNote = async (color: string) => {
    try {
      const response = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'New Note',
          content: '',
          color,
          isFavorite: false,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setNotes([data.note, ...notes]);
        setIsColorDropdownOpen(false);
        toast.success('Note created');
        // Start editing the title immediately
        setTimeout(() => {
          setEditingNoteId(data.note.id);
          setEditingField('title');
          setEditTitle(data.note.title);
          setEditContent(data.note.content || '');
        }, 100);
      } else {
        const errorData = await response.json();
        toast.error(errorData.error || 'Failed to create note');
      }
    } catch {
      toast.error('Failed to create note');
    }
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

    const newTitle = editingField === 'title' ? editTitle : note.title;
    const newContent = editingField === 'content' ? editContent : note.content;

    // Only save if something changed
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
          title: newTitle,
          content: newContent,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setNotes(notes.map((n) => (n.id === noteId ? data.note : n)));
        setEditingNoteId(null);
        setEditingField(null);
        toast.success('Note updated');
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

  return (
    <div className="min-h-screen bg-white">
      <div className="flex h-screen">
        {/* Left Sidebar */}
        <div className="w-20 bg-gray-100 flex flex-col items-center py-6 space-y-6 border-r">
          {/* Plus Button */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setIsColorDropdownOpen(!isColorDropdownOpen)}
              className="w-12 h-12 bg-black rounded-full flex items-center justify-center text-white hover:bg-gray-800 transition-colors cursor-pointer"
            >
              <Plus className="w-6 h-6" />
            </button>

            {/* Color Dropdown */}
            <AnimatePresence>
              {isColorDropdownOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.8, rotate: -5 }}
                  animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
                  exit={{ opacity: 0, y: 10, scale: 0.8, rotate: -5 }}
                  transition={{ 
                    type: "spring",
                    stiffness: 300,
                    damping: 25,
                    duration: 0.3
                  }}
                  className="absolute top-full mt-4 left-1/2 -translate-x-1/2 bg-white rounded-lg shadow-lg p-2 z-50"
                >
                  <div className="flex flex-col space-y-2">
                    {colorPalette.map((color, index) => (
                      <motion.button
                        key={color.value}
                        initial={{ opacity: 0, scale: 0.5, x: -20 }}
                        animate={{ opacity: 1, scale: 1, x: 0 }}
                        transition={{ 
                          delay: index * 0.05,
                          type: "spring",
                          stiffness: 400,
                          damping: 20
                        }}
                        onClick={() => handleCreateNote(color.value)}
                        className="w-10 h-10 rounded-full hover:scale-110 transition-transform cursor-pointer"
                        style={{ backgroundColor: color.value }}
                        title={color.name}
                      />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto p-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-8">Notes</h1>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className="h-64 rounded-lg bg-gray-200 animate-pulse"
                />
              ))}
            </div>
          ) : notes.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-gray-500 text-lg">
                No notes yet. Click the + button to create your first note!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {notes.map((note) => (
                <motion.div
                  key={note.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.2 }}
                  className="rounded-lg p-6 min-h-[200px] flex flex-col relative group"
                  style={{ backgroundColor: note.color }}
                >
                  {/* Star Icon */}
                  {note.isFavorite && (
                    <div className="absolute top-4 right-4">
                      <Star weight="fill" className="w-5 h-5 text-yellow-400" />
                    </div>)}

                  {/* Note Content */}
                  <div className="flex-1 mb-4 overflow-hidden">
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
                        className="text-lg font-semibold text-gray-900 mb-2 w-full bg-transparent focus:outline-none border-none"
                        placeholder="Note title"
                      />
                    ) : (
                      <h3
                        onClick={() => handleStartEdit(note, 'title')}
                        className="text-lg font-semibold text-gray-900 mb-2 line-clamp-2 cursor-text hover:bg-black/5 rounded px-1 -mx-1 transition-colors"
                      >
                        {note.title}
                      </h3>
                    )}
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
                        className="hide-scrollbar text-sm text-gray-700 w-full bg-transparent rounded p-2 focus:outline-none resize-none min-h-[80px] max-h-48 overflow-y-auto border-none"
                        placeholder="Write your note here..."
                      />
                    ) : (
                      <div
                        onClick={() => handleStartEdit(note, 'content')}
                        className="hide-scrollbar text-sm text-black cursor-text rounded px-1 -mx-1 py-1 transition-colors min-h-[60px] max-h-40 overflow-y-auto"
                      >
                        {note.content || (
                          <span className="text-black italic">Click to add content...</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Date and Actions */}
                  <div className="flex items-center justify-between mt-auto">
                    <span className="text-xs text-gray-600">
                      {format(new Date(note.createdAt), 'MMM d, yyyy')}
                    </span>
                    <div className="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleToggleFavorite(note)}
                        className="p-1 hover:bg-black/10 rounded transition-colors"
                        title={note.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                      >
                        <Star
                          className={`w-4 h-4 ${
                            note.isFavorite
                              ? 'text-yellow-400'
                              : 'text-gray-600'
                          }`}
                          weight={note.isFavorite ? "fill" : "regular"}
                        />
                      </button>
                      <button
                        onClick={() => handleDeleteNote(note.id)}
                        className="p-1 hover:bg-black/10 rounded transition-colors"
                        title="Delete note"
                      >
                        <X className="w-4 h-4 text-gray-600" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

