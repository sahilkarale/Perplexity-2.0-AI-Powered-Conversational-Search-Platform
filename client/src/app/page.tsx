"use client";

import Header from '@/components/Header';
import InputBar from '@/components/InputBar';
import MessageArea from '@/components/MessageArea';
import React, { useState } from 'react';

interface SearchInfo {
  stages: string[];
  query: string;
  urls: string[];
  error?: string;
}

interface Message {
  id: number;
  content: string;
  isUser: boolean;
  type: string;
  isLoading?: boolean;
  searchInfo?: SearchInfo;
}

const Home = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      content: 'Hi there, how can I help you?',
      isUser: false,
      type: 'message',
    }
  ]);
  
  const [currentMessage, setCurrentMessage] = useState("");
  const [checkpointId, setCheckpointId] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!currentMessage.trim()) return;

    // First add the user message to the chat
    const newMessageId = messages.length > 0 ? Math.max(...messages.map(msg => msg.id)) + 1 : 1;

    setMessages(prev => [
      ...prev,
      {
        id: newMessageId,
        content: currentMessage,
        isUser: true,
        type: 'message'
      }
    ]);

    const userInput = currentMessage;
    setCurrentMessage(""); // Clear input field immediately

    try {
      // Create AI response placeholder
      const aiResponseId = newMessageId + 1;
      setMessages(prev => [
        ...prev,
        {
          id: aiResponseId,
          content: "",
          isUser: false,
          type: 'message',
          isLoading: true,
          searchInfo: {
            stages: [],
            query: "",
            urls: []
          }
        }
      ]);

      // Create URL with checkpoint ID if it exists
      let url = `${process.env.NEXT_PUBLIC_API_URL}/chat_stream/${encodeURIComponent(userInput)}`;
      if (checkpointId) {
        url += `?checkpoint_id=${encodeURIComponent(checkpointId)}`;
      }

      // Connect to SSE endpoint using EventSource
      const eventSource = new EventSource(url);
      let streamedContent = "";
      let searchData: SearchInfo | null = null;
      let hasReceivedContent = false;

      // Process incoming messages
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'checkpoint') {
            // Store the checkpoint ID for future requests
            setCheckpointId(data.checkpoint_id);
          } 
          else if (data.type === 'content') {
            streamedContent += data.content;
            hasReceivedContent = true;

            // Update message with accumulated content
            setMessages(prev =>
              prev.map(msg =>
                msg.id === aiResponseId
                  ? { ...msg, content: streamedContent, isLoading: false }
                  : msg
              )
            );
          } 
          else if (data.type === 'search_start') {
            // Create search info with 'searching' stage
            const newSearchInfo: SearchInfo = {
              stages: ['searching'],
              query: data.query,
              urls: []
            };
            searchData = newSearchInfo;

            // Update the AI message with search info
            setMessages(prev =>
              prev.map(msg =>
                msg.id === aiResponseId
                  ? { ...msg, content: streamedContent, searchInfo: newSearchInfo, isLoading: false }
                  : msg
              )
            );
          } 
          else if (data.type === 'search_results') {
            try {
              // Parse URLs from search results
              const urls = typeof data.urls === 'string' ? JSON.parse(data.urls) : data.urls;

              // Update search info to add 'reading' stage
              const newSearchInfo: SearchInfo = {
                stages: searchData ? [...searchData.stages, 'reading'] : ['reading'],
                query: searchData?.query || "",
                urls: urls
              };
              searchData = newSearchInfo;

              // Update the AI message with search info
              setMessages(prev =>
                prev.map(msg =>
                  msg.id === aiResponseId
                    ? { ...msg, content: streamedContent, searchInfo: newSearchInfo, isLoading: false }
                    : msg
                )
              );
            } catch (err) {
              console.error("Error parsing search results:", err);
            }
          } 
          else if (data.type === 'search_error') {
            // Handle search error
            const newSearchInfo: SearchInfo = {
              stages: searchData ? [...searchData.stages, 'error'] : ['error'],
              query: searchData?.query || "",
              error: data.error,
              urls: []
            };
            searchData = newSearchInfo;

            setMessages(prev =>
              prev.map(msg =>
                msg.id === aiResponseId
                  ? { ...msg, content: streamedContent, searchInfo: newSearchInfo, isLoading: false }
                  : msg
              )
            );
          } 
          else if (data.type === 'end') {
            // When stream ends, add 'writing' stage if we had search info
            if (searchData) {
              const finalSearchInfo: SearchInfo = {
                ...searchData,
                stages: [...searchData.stages, 'writing']
              };

              setMessages(prev =>
                prev.map(msg =>
                  msg.id === aiResponseId
                    ? { ...msg, searchInfo: finalSearchInfo, isLoading: false }
                    : msg
                )
              );
            }

            eventSource.close();
          }
        } catch (error) {
          console.error("Error parsing event data:", error, event.data);
        }
      };

      // Handle errors
      eventSource.onerror = (event) => {
        try {
          console.error('EventSource error event:', event);
          
          // Safely extract error information
          const errorInfo = {
            type: event.type,
            readyState: eventSource.readyState,
            url: eventSource.url,
            timestamp: new Date().toISOString()
          };
          
          console.error('EventSource error details:', JSON.stringify(errorInfo));
        } catch (loggingError) {
          console.error('Failed to log EventSource error:', loggingError);
        }

        eventSource.close();

        if (!hasReceivedContent) {
          setMessages(prev =>
            prev.map(msg =>
              msg.id === aiResponseId
                ? { 
                    ...msg, 
                    content: 'Sorry, there was an error processing your request. Please try again.', 
                    isLoading: false,
                    searchInfo: {
                      stages: ['error'],
                      query: "",
                      urls: []
                    }
                  }
                : msg
            )
          );
        }
      };

    } catch (error) {
      console.error("Error setting up EventSource:", error);
      setMessages(prev => [
        ...prev,
        {
          id: newMessageId + 1,
          content: "Sorry, there was an error connecting to the server. Please check your connection and try again.",
          isUser: false,
          type: 'message',
          isLoading: false,
          searchInfo: {
            stages: ['error'],
            query: "",
            urls: []
          }
        }
      ]);
    }
  };

  return (
    <div className="flex justify-center bg-gray-100 min-h-screen py-8 px-4">
      <div className="w-[70%] bg-white flex flex-col rounded-xl shadow-lg border border-gray-100 overflow-hidden h-[90vh]">
        <Header />
        <MessageArea messages={messages} />
        <InputBar 
          currentMessage={currentMessage} 
          setCurrentMessage={setCurrentMessage} 
          onSubmit={handleSubmit} 
        />
      </div>
    </div>
  );
};

export default Home;
