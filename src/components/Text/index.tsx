import Link from 'next/link';
import React from 'react';
import { cn } from 'utils';

/**
 * Properties for a card component.
 */
type TextProps = {
    variant:
    | 'big-heading'
    | 'heading'
    | 'sub-heading'
    | 'nav-heading'
    | 'nav'
    | 'input'
    | 'label';
    className?: string;
    href?: string;
    children?: React.ReactNode;
    id?: string;
};

/**
 * Pre-defined styling, according to agreed-upon design-system.
 */
const variants = {
    heading: 'heading-class',
    'sub-heading': 'sub-heading-class',
    'nav-heading': 'nav-heading-class',
    nav: 'nav-class',
    paragraph: 'paragraph-class',
    'sub-paragraph': 'sub-paragraph-class',
    input: 'input-class',
    label: 'label-class',
    'big-heading': 'big-heading-class', // Add this line
};

/**
 * Definition of a card component,the main purpose of
 * which is to neatly display information. Can be both
 * interactive and static.
 *
 * @param variant Variations relating to pre-defined styling of the element.
 * @param className Custom classes to be applied to the element.
 * @param children Child elements to be rendered within the component.
 */
const Text = ({ variant, className, href, children }: TextProps) => (
    <p className={cn(className, variants[variant])}>
        {href ? (
            <Link href={href} className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                {children}
            </Link>
        ) : (
            children
        )}
    </p>
);

export default Text;