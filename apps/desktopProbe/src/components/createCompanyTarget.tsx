import { useState } from 'react';

import { useError } from '@/hooks/error';
import { getExceptionMessage } from '@first2apply/core';
import { useForm } from '@first2apply/ui';
import { useLinks } from '@first2apply/ui';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@first2apply/ui';
import { useToast } from '@first2apply/ui';
import { Alert, AlertDescription, AlertTitle } from '@first2apply/ui';
import { Button } from '@first2apply/ui';
import { Form, FormControl, FormField, FormItem, FormLabel } from '@first2apply/ui';
import { Input } from '@first2apply/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

import { Icons } from './icons';

const formSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  url: z.string().url('Invalid URL').min(1, 'URL is required'),
});

export function CreateCompanyTarget() {
  const { handleError } = useError();
  const { createLink } = useLinks();
  const { toast } = useToast();

  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: { title: '', url: '' },
  });

  const onSubmit = async (data: { title: string; url: string }) => {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const createdLink = await createLink({
        title: data.title.trim(),
        url: data.url.trim(),
        html: '',
        webPageRuntimeData: {},
        force: false,
        scanFrequency: 'daily',
      });
      toast({
        title: 'Target added',
        description: `${createdLink.title} will be crawled once per day.`,
      });
      form.reset();
      setIsOpen(false);
    } catch (error) {
      setErrorMessage(getExceptionMessage(error, true));
    } finally {
      setIsSubmitting(false);
    }
  };

  const onOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      form.reset();
      setErrorMessage(null);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="default" size="lg" className="px-10 text-base">
          Add Target
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[90vw] p-6">
        <DialogHeader>
          <DialogTitle className="text-xl font-medium tracking-wide">Add target company page</DialogTitle>
          <DialogDescription>
            Paste a company career page URL (e.g. a company's /careers or /jobs page). We'll crawl it once per day and
            pull any new jobs into your feed.
            {errorMessage && (
              <Alert variant="destructive" className="mt-4">
                <AlertTitle>Could not add target</AlertTitle>
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            )}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-2">
            <div className="flex flex-col gap-3">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem className="w-full">
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input
                        id="title"
                        type="text"
                        placeholder="Anthropic careers"
                        disabled={isSubmitting}
                        {...field}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="url"
                render={({ field }) => (
                  <FormItem className="w-full">
                    <FormLabel>URL</FormLabel>
                    <FormControl>
                      <Input
                        id="url"
                        type="url"
                        placeholder="https://www.anthropic.com/careers"
                        disabled={isSubmitting}
                        {...field}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <div className="flex flex-row items-center justify-between pt-3">
              <Button variant="outline" type="button" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!form.formState.isValid || isSubmitting}
                className="ml-auto flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Icons.spinner2 className="h-4 w-4 animate-spin" />
                    Adding...
                  </>
                ) : (
                  'Add target'
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
